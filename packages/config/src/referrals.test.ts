import { describe, expect, it } from "vitest";
import {
	bookDemoUrl,
	cloudAppUrl,
	cloudPricingUrl,
	cloudSignupUrl,
	demoSiteUrl,
	marketingUrl,
	taggedUrl,
} from "./referrals";

/**
 * The contract every link has to keep once a site exists: land on the right
 * page, and say where the click came from. Online Reset has no public site yet
 * (brand-links.ts), so every builder returns "" and callers hide the link.
 */
describe("referral links", () => {
	it("tags a configured destination with the source and keeps the path", () => {
		expect(taggedUrl("https://example.com", "/docs", "cli")).toBe("https://example.com/docs?ref=cli");
		expect(taggedUrl("https://example.com", "/app/org/acme/brand/acme/citations", "marketing-demo-frame")).toBe(
			"https://example.com/app/org/acme/brand/acme/citations?ref=marketing-demo-frame",
		);
	});

	it("returns nothing for an unconfigured destination", () => {
		expect(taggedUrl("", "/docs", "cli")).toBe("");
	});

	it("links nowhere while no public site is configured", () => {
		for (const url of [
			marketingUrl("/docs", "cli"),
			cloudAppUrl("cli"),
			cloudSignupUrl("cli"),
			cloudPricingUrl("cli"),
			bookDemoUrl("cli"),
			demoSiteUrl("cli"),
		]) {
			expect(url).toBe("");
		}
	});
});
