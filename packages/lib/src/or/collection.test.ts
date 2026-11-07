import { describe, expect, it } from "vitest";
import { geoFromProfile, runEvidence } from "./collection";

describe("run evidence", () => {
	it("labels fixture runs as simulated and records the requested location honestly", () => {
		const geo = geoFromProfile({ country: "NZ", region: null, city: "christchurch" });
		expect(geo).toEqual({ country: "NZ", region: "Canterbury", city: "Christchurch", timezone: "Pacific/Auckland" });
		const evidence = runEvidence({ model: "gpt", provider: "fixture", webSearch: false } as never, {}, geo);
		expect(evidence).toMatchObject({
			collectionMethod: "fixture",
			locationApplied: "none",
			methodologyVersion: "or-m1",
		});
	});

	it("distinguishes grounded API runs from consumer-surface runs", () => {
		expect(
			runEvidence(
				{ model: "gpt-5", provider: "openai-api", webSearch: true } as never,
				{ locationApplied: "native" },
				null,
			),
		).toMatchObject({
			collectionMethod: "model_api_grounded",
			locationApplied: null,
		});
		expect(
			runEvidence(
				{ model: "chatgpt", provider: "dataforseo", webSearch: true } as never,
				{ locationApplied: "native" },
				{ country: "NZ" },
			).collectionMethod,
		).toBe("consumer_surface_via_vendor");
	});
});
