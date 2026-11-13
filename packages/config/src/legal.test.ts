import { describe, expect, it } from "vitest";
import { legalUrl, showsLegalLinks } from "./legal";

// Online Reset: no legal site is configured yet (brand-links.ts), so no
// deployment links any agreements, and nothing points at the upstream project's.
describe("showsLegalLinks", () => {
	it("shows no legal links in any mode while no legal site is configured", () => {
		for (const mode of ["cloud", "demo", "local", "whitelabel", undefined] as const) {
			expect(showsLegalLinks(mode)).toBe(false);
		}
	});
});

describe("legalUrl", () => {
	it("is empty while no legal site is configured", () => {
		expect(legalUrl("terms")).toBe("");
	});
});
