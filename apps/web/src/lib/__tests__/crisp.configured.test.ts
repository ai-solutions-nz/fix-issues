import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Online Reset (Packet 2b): the demo chat's next steps once our sites exist.
// brand-links.ts ships empty; crisp.test.ts covers that state.
vi.mock("@workspace/config/brand-links", async (importOriginal) => ({
	...(await importOriginal<typeof import("@workspace/config/brand-links")>()),
	PUBLIC_SITE_URL: "https://www.example.com",
	PUBLIC_APP_URL: "https://app.example.com",
	PUBLIC_DOCS_URL: "https://docs.example.com",
}));

async function loadCrisp() {
	vi.resetModules();
	return import("../crisp");
}

function queue(): unknown[][] {
	return ((window as unknown as { $crisp?: unknown[][] }).$crisp ?? []) as unknown[][];
}

function fire(event: string): void {
	const handler = queue().find((command) => command[0] === "on" && command[1] === event)?.[2] as
		| (() => void)
		| undefined;
	if (!handler) throw new Error(`No handler registered for ${event}`);
	handler();
}

beforeEach(() => {
	vi.stubGlobal("window", {} as Window);
	vi.stubGlobal("document", { createElement: () => ({ src: "", async: false }), head: { appendChild: () => {} } });
});
afterEach(() => vi.unstubAllGlobals());

describe("the demo next steps, with sites configured", () => {
	it("offers every next step the first time the chat is opened, and only then", async () => {
		const { initCrisp } = await loadCrisp();

		initCrisp("website-id", "demo");
		fire("chat:opened");
		fire("chat:opened");

		const shown = queue().filter((command) => command[0] === "do" && command[1] === "message:show");
		expect(shown, "reopening the chat must not repeat the sequence").toHaveLength(2);
		const [, nextSteps] = (shown[1]?.[2] ?? []) as [string, string];
		const linked = [...String(nextSteps).matchAll(/\]\((https?:[^)]+)\)/g)].map((match) => match[1]);
		expect(linked).toEqual([
			"https://www.example.com/demo?ref=demo-chat",
			"https://app.example.com/auth/register?ref=demo-chat",
			"https://docs.example.com/getting-started",
		]);
	});

	it("hands the operator the same three places", async () => {
		const { initCrisp } = await loadCrisp();

		initCrisp("website-id", "demo");

		const sessionData = JSON.stringify(queue().filter((command) => command[1] === "session:data"));
		expect(sessionData).toContain("https://www.example.com/demo?ref=demo-chat");
		expect(sessionData).toContain("https://app.example.com/auth/register?ref=demo-chat");
		expect(sessionData).toContain("https://docs.example.com/getting-started");
	});
});
