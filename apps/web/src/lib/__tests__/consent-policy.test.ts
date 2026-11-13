import { describe, expect, it } from "vitest";
import { asksForConsent, consentRequiredFor, hasAnalytics } from "../consent-policy";

const POSTHOG = { posthogKey: "phc_test", posthogHost: "https://eu.i.posthog.com" };

describe("hasAnalytics", () => {
	it("counts PostHog only with both a key and a host, since there is no default host", () => {
		expect(hasAnalytics(POSTHOG)).toBe(true);
		expect(hasAnalytics({ posthogKey: "phc_test" })).toBe(false);
		expect(hasAnalytics({ posthogHost: "https://eu.i.posthog.com" })).toBe(false);
	});

	it("counts Clarity, and nothing when no tool is configured", () => {
		expect(hasAnalytics({ clarityProjectId: "abc" })).toBe(true);
		expect(hasAnalytics({})).toBe(false);
		expect(hasAnalytics(undefined)).toBe(false);
	});
});

describe("asksForConsent", () => {
	it("always asks on our hosted deployments", () => {
		expect(asksForConsent("cloud", {})).toBe(true);
		expect(asksForConsent("demo", {})).toBe(true);
	});

	it("asks on local and whitelabel deployments once analytics is configured", () => {
		for (const mode of ["local", "whitelabel"] as const) {
			expect(asksForConsent(mode, POSTHOG)).toBe(true);
			expect(asksForConsent(mode, { clarityProjectId: "abc" })).toBe(true);
			expect(asksForConsent(mode, {}), `${mode} with nothing to consent to`).toBe(false);
		}
	});

	it("does not ask before the mode is known", () => {
		expect(asksForConsent(undefined, POSTHOG)).toBe(false);
	});
});

describe("consentRequiredFor", () => {
	it("follows the region on hosted deployments", () => {
		expect(consentRequiredFor("cloud", () => false)).toBe(false);
		expect(consentRequiredFor("demo", () => true)).toBe(true);
	});

	it("always waits for an explicit accept on local and whitelabel deployments", () => {
		expect(consentRequiredFor("local", () => false)).toBe(true);
		expect(consentRequiredFor("whitelabel", () => false)).toBe(true);
	});
});
