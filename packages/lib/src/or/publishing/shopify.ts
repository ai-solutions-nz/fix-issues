// Shopify Admin GraphQL page publishing. Written for Online Reset; not yet
// exercised against a live Shopify store (tested against a local mock only).
import {
	type PublishablePage,
	PublishError,
	type PublishResult,
	type PublishTarget,
	redact,
	withJsonLd,
} from "./types";

export interface ShopifyConnection {
	/** e.g. https://example-store.myshopify.com */
	shopUrl: string;
	accessToken: string;
	apiVersion?: string;
	status: "publish" | "draft";
	fetchImpl?: typeof fetch;
}

interface PageNode {
	id: string;
	handle: string;
	title: string;
	body: string;
	isPublished: boolean;
	onlineStoreUrl?: string | null;
}

async function gql<T>(c: ShopifyConnection, query: string, variables: Record<string, unknown>): Promise<T> {
	const res = await (c.fetchImpl ?? fetch)(
		`${c.shopUrl.replace(/\/$/, "")}/admin/api/${c.apiVersion ?? "2025-07"}/graphql.json`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": c.accessToken },
			body: JSON.stringify({ query, variables }),
			signal: AbortSignal.timeout(20_000),
		},
	);
	if (res.status === 401 || res.status === 403)
		throw new PublishError("AUTH_INVALID", "Shopify access token is invalid or lacks write_content scope", res.status);
	if (res.status === 429) throw new PublishError("RATE_LIMITED", "Shopify API rate limit exceeded", 429);
	if (!res.ok)
		throw new PublishError(
			"UPSTREAM_ERROR",
			`Shopify API error (${res.status}): ${redact(await res.text().catch(() => ""), [c.accessToken])}`,
			res.status,
		);
	const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
	if (json.errors?.length)
		throw new PublishError("UPSTREAM_ERROR", `Shopify GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`);
	return json.data as T;
}

const FIND = `query OrFindPage($q: String!) { pages(first: 1, query: $q) { nodes { id handle title body isPublished onlineStoreUrl } } }`;
const CREATE = `mutation OrPageCreate($page: PageCreateInput!) { pageCreate(page: $page) { page { id handle onlineStoreUrl } userErrors { field message } } }`;
const UPDATE = `mutation OrPageUpdate($id: ID!, $page: PageUpdateInput!) { pageUpdate(id: $id, page: $page) { page { id handle onlineStoreUrl } userErrors { field message } } }`;

type Mutation<K extends string> = Record<
	K,
	{ page: { id: string; handle: string; onlineStoreUrl?: string | null } | null; userErrors: { message: string }[] }
>;

function unwrap<K extends string>(data: Mutation<K>, key: K) {
	const r = data[key];
	if (r.userErrors.length || !r.page)
		throw new PublishError(
			"UPSTREAM_ERROR",
			`Shopify rejected the page: ${r.userErrors.map((e) => e.message).join("; ")}`,
		);
	return r.page;
}

export function shopifyTarget(c: ShopifyConnection): PublishTarget {
	return {
		kind: "shopify",
		async publish(page: PublishablePage): Promise<PublishResult> {
			const input = {
				title: page.title,
				handle: page.slug,
				body: withJsonLd(page.html, page.jsonLd),
				isPublished: c.status === "publish",
			};
			const found = await gql<{ pages: { nodes: PageNode[] } }>(c, FIND, { q: `handle:${page.slug}` });
			const existing = found.pages.nodes.find((n) => n.handle === page.slug);
			if (existing) {
				const p = unwrap(await gql<Mutation<"pageUpdate">>(c, UPDATE, { id: existing.id, page: input }), "pageUpdate");
				return {
					remoteId: p.id,
					url: p.onlineStoreUrl ?? "",
					snapshot: { title: existing.title, body: existing.body, isPublished: existing.isPublished },
				};
			}
			const p = unwrap(await gql<Mutation<"pageCreate">>(c, CREATE, { page: input }), "pageCreate");
			return { remoteId: p.id, url: p.onlineStoreUrl ?? "", snapshot: null };
		},
		async rollback(result: PublishResult): Promise<void> {
			const page = result.snapshot
				? { title: result.snapshot.title, body: result.snapshot.body, isPublished: result.snapshot.isPublished }
				: { isPublished: false };
			unwrap(await gql<Mutation<"pageUpdate">>(c, UPDATE, { id: result.remoteId, page }), "pageUpdate");
		},
	};
}
