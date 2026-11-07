import { describe, expect, it } from "vitest";
import {
	deriveCollectionMethod,
	groupByMethod,
	isSimulated,
	MixedMethodError,
	percentOf,
	requireSingleMethod,
} from "./measurement";

describe("measurement rules", () => {
	it("derives the collection method from provider access and search", () => {
		expect(deriveCollectionMethod({ providerId: "openai-api", access: "api", webSearch: true })).toBe(
			"model_api_grounded",
		);
		expect(deriveCollectionMethod({ providerId: "openai-api", access: "api", webSearch: false })).toBe(
			"model_api_ungrounded",
		);
		expect(deriveCollectionMethod({ providerId: "cloro", access: "scraped", webSearch: true })).toBe(
			"consumer_surface_via_vendor",
		);
	});

	it("always labels stub and fixture providers as simulated", () => {
		const m = deriveCollectionMethod({ providerId: "stub", access: "scraped", webSearch: true });
		expect(m).toBe("fixture");
		expect(isSimulated(m)).toBe(true);
		expect(isSimulated("model_api_grounded")).toBe(false);
	});

	it("refuses to aggregate across methods", () => {
		expect(() =>
			requireSingleMethod([{ collectionMethod: "fixture" }, { collectionMethod: "model_api_grounded" }]),
		).toThrow(MixedMethodError);
		expect(requireSingleMethod([{ collectionMethod: "fixture" }, { collectionMethod: "fixture" }])).toBe("fixture");
		expect(requireSingleMethod([])).toBeNull();
		expect([
			...groupByMethod([{ collectionMethod: "fixture" }, { collectionMethod: "model_api_grounded" }]).keys(),
		]).toEqual(["fixture", "model_api_grounded"]);
	});

	it("does not report a share of nothing as 0%", () => {
		expect(percentOf(0, 0)).toBeNull();
		expect(percentOf(1, 3)).toBe(33.3);
	});
});
