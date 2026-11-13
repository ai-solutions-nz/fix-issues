import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCrispWebsiteId } from "../config";

afterEach(() => vi.unstubAllEnvs());

describe("resolveCrispWebsiteId", () => {
	// Online Reset: no support chat id is configured (brand-links.ts), so even the
	// modes that would show the chat get none; the upstream id is gone.
	it.each(["cloud", "demo"])("returns nothing in %s mode while no chat id is configured", (mode) => {
		vi.stubEnv("DEPLOYMENT_MODE", mode);

		expect(resolveCrispWebsiteId()).toBeUndefined();
	});

	it.each(["local", "whitelabel"])("returns nothing in %s mode", (mode) => {
		vi.stubEnv("DEPLOYMENT_MODE", mode);

		expect(resolveCrispWebsiteId()).toBeUndefined();
	});

	// READ_ONLY makes a local deployment resolve to mode "demo".
	it("returns nothing for a read-only local deployment", () => {
		vi.stubEnv("DEPLOYMENT_MODE", "local");
		vi.stubEnv("READ_ONLY", "true");

		expect(resolveCrispWebsiteId()).toBeUndefined();
	});
});
