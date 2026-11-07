import { describe, expect, it } from "vitest";
import { dataForSeoLocation, describeLocation, locationPromptSuffix, nzTarget, openAiUserLocation } from "./geo";

describe("NZ location targeting", () => {
	it("resolves Christchurch to Canterbury, New Zealand", () => {
		const geo = nzTarget("christchurch");
		expect(geo).toEqual({ country: "NZ", region: "Canterbury", city: "Christchurch", timezone: "Pacific/Auckland" });
		expect(describeLocation(geo)).toBe("Christchurch, Canterbury, New Zealand");
	});

	it("rejects places it does not know instead of silently using the country", () => {
		expect(() => nzTarget("Springfield")).toThrow(/Unknown New Zealand city/);
	});

	it("builds the API user_location and the prompt-text fallback", () => {
		const geo = nzTarget("Christchurch");
		expect(openAiUserLocation(geo)).toEqual({
			type: "approximate",
			country: "NZ",
			region: "Canterbury",
			city: "Christchurch",
			timezone: "Pacific/Auckland",
		});
		expect(locationPromptSuffix(geo)).toContain("Christchurch, Canterbury, New Zealand");
	});

	it("sends a city by name and a country by code to DataForSEO", () => {
		expect(dataForSeoLocation(nzTarget("Christchurch"))).toEqual({
			location_name: "Christchurch,Canterbury,New Zealand",
		});
		expect(dataForSeoLocation({ country: "NZ" })).toEqual({ location_code: 2554 });
		expect(() => dataForSeoLocation({ country: "ZZ" })).toThrow();
	});
});
