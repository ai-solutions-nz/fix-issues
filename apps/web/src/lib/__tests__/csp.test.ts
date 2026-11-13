import { AD_TAG_CSP, AD_TAGS_CONFIGURED, adTagCspFor } from "@workspace/ui/lib/ad-tags";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveClarityProjectId } from "@/server/clarity";
import { buildContentSecurityPolicy, posthogCspSource } from "../csp";

const NO_ADS = adTagCspFor({ google: false, meta: false });

function directive(policy: string, name: string): string {
	return policy.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";
}

describe("posthogCspSource", () => {
	it("allows only the configured https PostHog origin", () => {
		expect(posthogCspSource("https://eu.i.posthog.com")).toBe("https://eu.i.posthog.com");
		expect(posthogCspSource("https://ph.example.com/ingest/")).toBe("https://ph.example.com");
	});

	it("allows nothing when the host is unset, not a URL, or not https", () => {
		expect(posthogCspSource(undefined)).toBe("");
		expect(posthogCspSource("")).toBe("");
		expect(posthogCspSource("not a url")).toBe("");
		expect(posthogCspSource("http://ph.example.com")).toBe("");
		expect(posthogCspSource("javascript:alert(1)")).toBe("");
		expect(posthogCspSource("data:text/html,x")).toBe("");
	});
});

describe("ad tag CSP sources", () => {
	it("are empty, and no ad tag can load, while no ad id is set", () => {
		expect(AD_TAGS_CONFIGURED).toBe(false);
		expect(AD_TAG_CSP).toEqual(NO_ADS);
		expect(Object.values(NO_ADS).every((value) => value === "")).toBe(true);
	});

	it("name Google's hosts only when the Google id is set, and Meta's only when Meta's is", () => {
		const google = adTagCspFor({ google: true, meta: false });
		expect(google.script).toContain("https://*.googletagmanager.com");
		expect(google.script).not.toContain("facebook");
		const meta = adTagCspFor({ google: false, meta: true });
		expect(meta.script).toBe("https://connect.facebook.net");
		expect(meta.script).not.toContain("google");
		const both = adTagCspFor({ google: true, meta: true });
		expect(both.script).toContain("https://www.google.com");
		expect(both.script).toContain("https://connect.facebook.net");
	});
});

describe("buildContentSecurityPolicy", () => {
	it("names no third-party analytics or ad host when none is configured", () => {
		const policy = buildContentSecurityPolicy({ clarity: false, adTags: NO_ADS });
		expect(policy).not.toMatch(/googletagmanager|google\.com|facebook|clarity|bing\.com|posthog|elmohq|crisp/);
		expect(directive(policy, "script-src")).toBe("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
	});

	it("adds Clarity's hosts only when Clarity is enabled", () => {
		const policy = buildContentSecurityPolicy({ clarity: true, adTags: NO_ADS });
		expect(directive(policy, "script-src")).toContain("https://*.clarity.ms");
		expect(directive(policy, "connect-src")).toContain("https://c.bing.com");
	});

	it("adds the PostHog origin only for an https host", () => {
		const policy = buildContentSecurityPolicy({
			posthogHost: "https://ph.example.com",
			clarity: false,
			adTags: NO_ADS,
		});
		expect(directive(policy, "connect-src")).toContain("https://ph.example.com");
		const insecure = buildContentSecurityPolicy({
			posthogHost: "http://ph.example.com",
			clarity: false,
			adTags: NO_ADS,
		});
		expect(insecure).not.toContain("ph.example.com");
	});

	it("adds ad hosts only when an ad id is set", () => {
		const policy = buildContentSecurityPolicy({ clarity: false, adTags: adTagCspFor({ google: true, meta: false }) });
		expect(directive(policy, "script-src")).toContain("https://*.googletagmanager.com");
		expect(policy).not.toContain("facebook");
	});
});

describe("resolveClarityProjectId", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("returns the configured project", () => {
		vi.stubEnv("VITE_CLARITY_PROJECT_ID", "abc123");
		vi.stubEnv("DISABLE_TELEMETRY", "");
		expect(resolveClarityProjectId()).toBe("abc123");
	});

	it("is switched off by DISABLE_TELEMETRY, like PostHog", () => {
		vi.stubEnv("VITE_CLARITY_PROJECT_ID", "abc123");
		vi.stubEnv("DISABLE_TELEMETRY", "1");
		expect(resolveClarityProjectId()).toBeUndefined();
	});
});
