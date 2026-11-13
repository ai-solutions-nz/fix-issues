import { describe, expect, it, vi } from "vitest";

// Online Reset (Packet 2b): the behaviour once our own legal site exists.
// brand-links.ts ships empty; legal.test.ts covers that state.
vi.mock("./brand-links", () => ({ PUBLIC_LEGAL_URL: "https://legal.example.com" }));

const { legalUrl, showsLegalLinks } = await import("./legal");

describe("showsLegalLinks, with a legal site configured", () => {
	it("links our policies from the deployments we operate or ship", () => {
		expect(showsLegalLinks("cloud")).toBe(true);
		expect(showsLegalLinks("demo")).toBe(true);
		expect(showsLegalLinks("local")).toBe(true);
	});

	it("stays silent in whitelabel, where the operator's own agreements govern", () => {
		expect(showsLegalLinks("whitelabel")).toBe(false);
	});

	it("stays silent before the mode is known", () => {
		expect(showsLegalLinks(undefined)).toBe(false);
	});
});

describe("legalUrl, with a legal site configured", () => {
	it("resolves to the published document on that site", () => {
		expect(legalUrl("terms")).toBe("https://legal.example.com/legal/terms");
		expect(legalUrl("cookies")).toBe("https://legal.example.com/legal/cookies");
	});
});
