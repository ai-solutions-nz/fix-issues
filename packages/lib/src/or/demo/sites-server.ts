import http from "node:http";
import type { AddressInfo } from "node:net";

/** Serves fictional demo sites on 127.0.0.1, one port per site. For tests and the local demo only. */
export async function serveSites(
	sites: Record<string, Record<string, string>>,
): Promise<{ origins: Record<string, string>; close: () => Promise<void> }> {
	const servers: http.Server[] = [];
	const origins: Record<string, string> = {};
	for (const [name, files] of Object.entries(sites)) {
		const server = http.createServer((req, res) => {
			const path = (req.url ?? "/").split("?")[0] as string;
			const body = files[path];
			if (body === undefined) {
				res
					.writeHead(404, { "content-type": "text/html" })
					.end("<!doctype html><title>Not found</title><h1>Not found</h1>");
				return;
			}
			const type = path.endsWith(".txt")
				? "text/plain"
				: path.endsWith(".xml")
					? "application/xml"
					: "text/html; charset=utf-8";
			res.writeHead(200, { "content-type": type }).end(body);
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		servers.push(server);
		origins[name] = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	}
	return { origins, close: async () => void (await Promise.all(servers.map((s) => new Promise((r) => s.close(r))))) };
}
