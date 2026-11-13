import { describe, expect, it } from "vitest";
import { posthogCspSource } from "../csp";

describe("posthogCspSource", () => {
	it("allows only the configured PostHog origin", () => {
		expect(posthogCspSource("https://eu.i.posthog.com")).toBe("https://eu.i.posthog.com");
		expect(posthogCspSource("https://ph.example.com/ingest/")).toBe("https://ph.example.com");
	});

	it("allows nothing when the host is unset or not a URL", () => {
		expect(posthogCspSource(undefined)).toBe("");
		expect(posthogCspSource("")).toBe("");
		expect(posthogCspSource("not a url")).toBe("");
	});
});
