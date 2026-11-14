/**
 * Packet 4 (Neo's P2c consent catch): only offered categories are stored, and
 * answers saved before that rule are asked again.
 */
import { ACCEPT_ALL, CONSENT_VERSION, maskToOffered, readConsent, saveConsent } from "@workspace/ui/lib/cookie-consent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "elmo.cookie-consent";

beforeEach(() => {
	const store = new Map<string, string>();
	vi.stubGlobal("window", {
		localStorage: {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => store.set(key, value),
			removeItem: (key: string) => store.delete(key),
		},
		dispatchEvent: () => true,
	});
	vi.stubGlobal("CustomEvent", class {});
});
afterEach(() => vi.unstubAllGlobals());

describe("maskToOffered", () => {
	it("records advertising as refused when it was not offered, even after 'Save choices' with it switched on", () => {
		expect(maskToOffered({ analytics: true, marketing: true }, { marketing: false })).toEqual({
			analytics: true,
			marketing: false,
		});
		expect(maskToOffered(ACCEPT_ALL, { marketing: false })).toEqual({ analytics: true, marketing: false });
	});

	it("keeps the visitor's choice for every category that was offered", () => {
		expect(maskToOffered({ analytics: false, marketing: true }, { marketing: true })).toEqual({
			analytics: false,
			marketing: true,
		});
		expect(maskToOffered(ACCEPT_ALL, { marketing: true })).toEqual(ACCEPT_ALL);
	});
});

describe("stored consent versions", () => {
	it("asks again rather than honouring an answer saved before masking (version 1)", () => {
		expect(CONSENT_VERSION).toBe(2);
		window.localStorage.setItem(
			KEY,
			JSON.stringify({ analytics: true, marketing: true, version: 1, at: "2026-11-01" }),
		);
		expect(readConsent()).toBeNull();

		saveConsent(maskToOffered(ACCEPT_ALL, { marketing: false }));
		expect(readConsent()).toEqual({ analytics: true, marketing: false });
		expect(JSON.parse(window.localStorage.getItem(KEY) ?? "{}").version).toBe(2);
	});
});
