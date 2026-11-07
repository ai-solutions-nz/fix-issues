import { describe, expect, it } from "vitest";
import { shopifyTarget } from "./shopify";

function mockShopify() {
	const calls: { query: string; variables: Record<string, unknown>; token: string | null }[] = [];
	const pages: Record<string, { id: string; handle: string; title: string; body: string; isPublished: boolean }> = {};
	const fetchImpl = (async (_url: string, init: RequestInit) => {
		const { query, variables } = JSON.parse(init.body as string);
		calls.push({ query, variables, token: (init.headers as Record<string, string>)["X-Shopify-Access-Token"] ?? null });
		let data: unknown;
		if (query.includes("OrFindPage"))
			data = { pages: { nodes: Object.values(pages).filter((p) => `handle:${p.handle}` === variables.q) } };
		else if (query.includes("OrPageCreate")) {
			const page = { id: `gid://shopify/Page/${Object.keys(pages).length + 1}`, ...variables.page };
			pages[page.id] = page;
			data = {
				pageCreate: {
					page: { id: page.id, handle: page.handle, onlineStoreUrl: `https://shop.example/pages/${page.handle}` },
					userErrors: [],
				},
			};
		} else {
			Object.assign(pages[variables.id] ?? {}, variables.page);
			data = {
				pageUpdate: {
					page: { id: variables.id, handle: pages[variables.id]?.handle, onlineStoreUrl: null },
					userErrors: [],
				},
			};
		}
		return new Response(JSON.stringify({ data }), { status: 200 });
	}) as unknown as typeof fetch;
	return { calls, pages, fetchImpl };
}

describe("Shopify publishing (mocked Admin GraphQL)", () => {
	it("creates a page with JSON-LD, then updates it with a snapshot, then rolls back", async () => {
		const m = mockShopify();
		const target = shopifyTarget({
			shopUrl: "https://shop.example",
			accessToken: "shpat_test",
			status: "publish",
			fetchImpl: m.fetchImpl,
		});
		const page = {
			title: "Hot water",
			slug: "hot-water",
			html: "<h1>Hot water</h1>",
			metaDescription: "",
			jsonLd: { "@type": "Plumber" },
		};
		const created = await target.publish(page);
		expect(created.snapshot).toBeNull();
		expect(m.calls[1]?.variables.page).toMatchObject({ handle: "hot-water", isPublished: true });
		expect(JSON.stringify(m.calls[1]?.variables.page)).toContain("application/ld+json");
		expect(m.calls.every((c) => c.token === "shpat_test")).toBe(true);
		const updated = await target.publish({ ...page, html: "<h1>Hot water v2</h1>" });
		expect(updated.snapshot).toMatchObject({ title: "Hot water", isPublished: true });
		await target.rollback(updated);
		expect(Object.values(m.pages)[0]?.body).toContain("<h1>Hot water</h1>");
	});

	it("redacts the token from upstream errors", async () => {
		const target = shopifyTarget({
			shopUrl: "https://shop.example",
			accessToken: "shpat_secret",
			status: "draft",
			fetchImpl: (async () => new Response("bad token shpat_secret", { status: 500 })) as unknown as typeof fetch,
		});
		await expect(
			target.publish({ title: "t", slug: "s", html: "", metaDescription: "", jsonLd: null }),
		).rejects.toThrow(/\*\*\*/);
	});
});
