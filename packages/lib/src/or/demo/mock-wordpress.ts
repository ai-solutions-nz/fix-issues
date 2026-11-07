import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A local stand-in for the WordPress REST API (pages endpoints only), for
 * tests and the demo. It checks Basic auth, stores pages in memory and serves
 * each published page at /<slug>/ so post-publication verification can fetch it.
 */
export interface MockWordpress {
	url: string;
	pages: Map<number, { id: number; slug: string; title: string; content: string; excerpt: string; status: string }>;
	requests: { method: string; path: string }[];
	close: () => Promise<void>;
}

export async function startMockWordpress(credentials: {
	username: string;
	appPassword: string;
}): Promise<MockWordpress> {
	const pages: MockWordpress["pages"] = new Map();
	const requests: MockWordpress["requests"] = [];
	let nextId = 100;
	const expected = `Basic ${Buffer.from(`${credentials.username}:${credentials.appPassword}`).toString("base64")}`;
	let base = "";
	const toJson = (p: NonNullable<ReturnType<typeof pages.get>>) => ({
		id: p.id,
		slug: p.slug,
		status: p.status,
		link: `${base}/${p.slug}/`,
		title: { raw: p.title, rendered: p.title },
		content: { raw: p.content, rendered: p.content },
		excerpt: { raw: p.excerpt },
	});
	type Send = (status: number, body: unknown, type?: string) => void;
	const api = async (req: http.IncomingMessage, url: URL, send: Send) => {
		if (req.headers.authorization !== expected) return send(401, { code: "rest_not_logged_in" });
		const chunks: Buffer[] = [];
		for await (const c of req) chunks.push(c as Buffer);
		const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
		return route(req.method ?? "GET", url, body, send);
	};
	const route = (method: string, url: URL, body: Record<string, string>, send: Send) => {
		const collection = url.pathname === "/wp-json/wp/v2/pages";
		if (collection && method === "GET")
			return send(200, [...pages.values()].filter((p) => p.slug === url.searchParams.get("slug")).map(toJson));
		if (collection && method === "POST") {
			const page = { id: nextId++, slug: "", title: "", content: "", excerpt: "", status: "draft", ...body };
			pages.set(page.id, page);
			return send(201, toJson(page));
		}
		const id = /^\/wp-json\/wp\/v2\/pages\/(\d+)$/.exec(url.pathname)?.[1];
		const page = id && method === "POST" ? pages.get(Number(id)) : undefined;
		if (!page) return send(404, { code: "rest_no_route" });
		Object.assign(
			page,
			Object.fromEntries(
				Object.entries(body).filter(([k]) => ["title", "content", "excerpt", "status", "slug"].includes(k)),
			),
		);
		return send(200, toJson(page));
	};
	const site = (url: URL, send: Send) => {
		const slug = url.pathname.replace(/^\/|\/$/g, "");
		const page = [...pages.values()].find((p) => p.slug === slug && p.status === "publish");
		if (!page) return send(404, "<!doctype html><title>Not found</title>", "text/html");
		return send(
			200,
			`<!doctype html><html><head><title>${page.title}</title></head><body><main>${page.content}</main></body></html>`,
			"text/html",
		);
	};
	const server = http.createServer(async (req, res) => {
		const url = new URL(req.url ?? "/", base);
		requests.push({ method: req.method ?? "GET", path: url.pathname });
		const send: Send = (status, body, type = "application/json") =>
			void res.writeHead(status, { "content-type": type }).end(typeof body === "string" ? body : JSON.stringify(body));
		if (url.pathname.startsWith("/wp-json/")) await api(req, url, send);
		else site(url, send);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	return { url: base, pages, requests, close: () => new Promise((r) => server.close(() => r())) };
}
