// Request handling (Basic auth with an application password, status-to-error
// mapping, credential redaction) and the page create/update flow are adapted
// from Canonry packages/integration-wordpress/src/wordpress-client.ts at
// f5d4612 (MIT, see THIRD_PARTY_NOTICES.md). Snapshot-and-restore rollback is
// Online Reset's own; WordPress core has no revision "restore" endpoint.
import {
	type PublishablePage,
	PublishError,
	type PublishResult,
	type PublishTarget,
	redact,
	withJsonLd,
} from "./types";

export interface WordpressConnection {
	siteUrl: string;
	username: string;
	appPassword: string;
	status: "publish" | "draft";
	fetchImpl?: typeof fetch;
}

interface WpPage {
	id: number;
	slug: string;
	status: string;
	link?: string;
	title?: { raw?: string; rendered?: string };
	content?: { raw?: string; rendered?: string };
	excerpt?: { raw?: string };
}

const TIMEOUT_MS = 20_000;

async function wpJson<T>(c: WordpressConnection, path: string, init?: RequestInit): Promise<T> {
	const res = await (c.fetchImpl ?? fetch)(`${c.siteUrl.replace(/\/$/, "")}${path}`, {
		...init,
		headers: {
			Authorization: `Basic ${Buffer.from(`${c.username}:${c.appPassword}`).toString("base64")}`,
			...(init?.body != null ? { "Content-Type": "application/json" } : {}),
		},
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	if (res.status === 401 || res.status === 403)
		throw new PublishError(
			"AUTH_INVALID",
			"WordPress credentials are invalid or lack permission for this action",
			res.status,
		);
	if (res.status === 404) throw new PublishError("NOT_FOUND", "WordPress endpoint not found", 404);
	if (res.status === 429) throw new PublishError("RATE_LIMITED", "WordPress API rate limit exceeded", 429);
	if (!res.ok) {
		const detail = redact((await res.text().catch(() => "")) || res.statusText, [c.appPassword, c.username]);
		throw new PublishError("UPSTREAM_ERROR", `WordPress API error (${res.status}): ${detail}`, res.status);
	}
	return (await res.json()) as T;
}

async function findBySlug(c: WordpressConnection, slug: string): Promise<WpPage | null> {
	const pages = await wpJson<WpPage[]>(
		c,
		`/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}&context=edit&status=any`,
	);
	return pages.find((p) => p.slug === slug) ?? null;
}

export function wordpressTarget(c: WordpressConnection): PublishTarget {
	return {
		kind: "wordpress",
		async publish(page: PublishablePage): Promise<PublishResult> {
			const body = {
				title: page.title,
				slug: page.slug,
				content: withJsonLd(page.html, page.jsonLd),
				excerpt: page.metaDescription,
				status: c.status,
			};
			const existing = await findBySlug(c, page.slug);
			if (existing) {
				const snapshot = {
					id: existing.id,
					title: existing.title?.raw ?? "",
					content: existing.content?.raw ?? "",
					excerpt: existing.excerpt?.raw ?? "",
					status: existing.status,
				};
				const updated = await wpJson<WpPage>(c, `/wp-json/wp/v2/pages/${existing.id}`, {
					method: "POST",
					body: JSON.stringify(body),
				});
				return { remoteId: String(updated.id), url: updated.link ?? "", snapshot };
			}
			const created = await wpJson<WpPage>(c, "/wp-json/wp/v2/pages", { method: "POST", body: JSON.stringify(body) });
			return { remoteId: String(created.id), url: created.link ?? "", snapshot: null };
		},
		async rollback(result: PublishResult): Promise<void> {
			const restore = result.snapshot
				? {
						title: result.snapshot.title,
						content: result.snapshot.content,
						excerpt: result.snapshot.excerpt,
						status: result.snapshot.status,
					}
				: { status: "draft" };
			await wpJson<WpPage>(c, `/wp-json/wp/v2/pages/${result.remoteId}`, {
				method: "POST",
				body: JSON.stringify(restore),
			});
		},
	};
}
