import { afterEach, describe, expect, it, vi } from "vitest";

const dfs = vi.hoisted(() => ({ googleKeywordIdeasLive: vi.fn(), googleOrganicLiveAdvanced: vi.fn() }));

vi.mock("dataforseo-client", () => ({
	DataforseoLabsApi: class {
		googleKeywordIdeasLive = dfs.googleKeywordIdeasLive;
	},
	SerpApi: class {
		googleOrganicLiveAdvanced = dfs.googleOrganicLiveAdvanced;
	},
	AiOptimizationApi: class {},
	DataforseoLabsGoogleKeywordIdeasLiveRequestInfo: class {
		constructor(args: Record<string, unknown>) {
			Object.assign(this, args);
		}
	},
	SerpGoogleOrganicLiveAdvancedRequestInfo: class {
		constructor(args: Record<string, unknown>) {
			Object.assign(this, args);
		}
	},
}));

import { dataforseoKeywords, fixtureKeywords } from "./keywords";

const christchurch = { country: "NZ", region: "Canterbury", city: "Christchurch" };

afterEach(() => vi.clearAllMocks());

describe("DataForSEO keywords (mocked, no network)", () => {
	it("requests NZ keyword ideas and maps volume and difficulty", async () => {
		dfs.googleKeywordIdeasLive.mockResolvedValue({
			tasks: [
				{
					result: [
						{
							items: [
								{
									keyword: "plumber christchurch",
									keyword_info: { search_volume: 880 },
									keyword_properties: { keyword_difficulty: 31 },
								},
								{},
							],
						},
					],
				},
			],
		});
		const ideas = await dataforseoKeywords.keywordIdeas(["plumber"], christchurch);
		expect(dfs.googleKeywordIdeasLive.mock.calls[0][0][0]).toMatchObject({
			keywords: ["plumber"],
			location_code: 2554,
		});
		expect(ideas).toEqual([{ keyword: "plumber christchurch", searchVolume: 880, difficulty: 31 }]);
	});

	it("checks rank from the buyer's city and finds the client's organic position", async () => {
		dfs.googleOrganicLiveAdvanced.mockResolvedValue({
			tasks: [
				{
					result: [
						{
							items: [
								{ type: "local_pack" },
								{ type: "organic", rank_absolute: 2, domain: "rival.example", url: "https://rival.example/" },
								{
									type: "organic",
									rank_absolute: 5,
									domain: "www.client.example",
									url: "https://www.client.example/drains",
								},
							],
						},
					],
				},
			],
		});
		const r = await dataforseoKeywords.rankCheck("blocked drains christchurch", christchurch, "client.example");
		expect(dfs.googleOrganicLiveAdvanced.mock.calls[0][0][0]).toMatchObject({
			location_name: "Christchurch,Canterbury,New Zealand",
			depth: 30,
		});
		expect(r).toEqual({
			keyword: "blocked drains christchurch",
			position: 5,
			url: "https://www.client.example/drains",
			topDomains: ["rival.example", "www.client.example"],
		});
	});
});

describe("fixture keywords", () => {
	it("is deterministic and labelled as a fixture", async () => {
		expect(fixtureKeywords.method).toBe("fixture");
		expect(await fixtureKeywords.keywordIdeas(["plumber"], christchurch)).toEqual(
			await fixtureKeywords.keywordIdeas(["plumber"], christchurch),
		);
	});
});
