import { describe, expect, it, vi } from "vitest";

// Online Reset (Packet 2b): the link contract once our sites exist.
// brand-links.ts ships empty; referrals.test.ts covers that state.
vi.mock("./brand-links", () => ({
	PUBLIC_SITE_URL: "https://www.example.com",
	PUBLIC_APP_URL: "https://app.example.com",
	PUBLIC_DEMO_URL: "https://demo.example.com",
}));

const { bookDemoUrl, cloudAppUrl, cloudPricingUrl, cloudSignupUrl, demoSiteUrl, marketingUrl } = await import(
	"./referrals"
);

describe("referral links, with sites configured", () => {
	const builders = {
		marketing: () => marketingUrl("/docs", "cli"),
		app: () => cloudAppUrl("cli"),
		signup: () => cloudSignupUrl("cli"),
		pricing: () => cloudPricingUrl("cli"),
		demo: () => bookDemoUrl("cli"),
		liveDemo: () => demoSiteUrl("cli"),
	};

	it.each(Object.entries(builders))("%s carries the source", (_name, build) => {
		expect(new URL(build()).searchParams.get("ref")).toBe("cli");
	});

	it("points each destination at its own page", () => {
		expect(marketingUrl("/docs", "cloud-signin")).toBe("https://www.example.com/docs?ref=cloud-signin");
		expect(cloudAppUrl("marketing-cta")).toBe("https://app.example.com/?ref=marketing-cta");
		expect(cloudSignupUrl("cloud-signin")).toBe("https://app.example.com/auth/register?ref=cloud-signin");
		expect(cloudPricingUrl("cloud-signin")).toBe("https://www.example.com/pricing?ref=cloud-signin");
		expect(bookDemoUrl("cloud-signin")).toBe("https://www.example.com/demo?ref=cloud-signin");
		expect(demoSiteUrl("cloud-signin")).toBe("https://demo.example.com/?ref=cloud-signin");
		expect(demoSiteUrl("marketing-demo-frame", "/app/org/acme/brand/acme/citations")).toBe(
			"https://demo.example.com/app/org/acme/brand/acme/citations?ref=marketing-demo-frame",
		);
	});
});
