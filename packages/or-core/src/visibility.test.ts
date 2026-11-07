import { describe, expect, it } from "vitest";
import { MixedMethodError } from "./measurement";
import { type AnalysedRun, analyseAnswer, observedSources, summariseByEngine, summariseVisibility } from "./visibility";

const brand = { competitorId: null, name: "Kōwhai Plumbing", domain: "kowhaiplumbing.example.nz" };
const rivals = [
	{ competitorId: "c1", name: "Southern Pipes", domain: "southernpipes.example.nz" },
	{ competitorId: "c2", name: "Avon Drainage", domain: "avondrainage.example.nz" },
];

describe("answer analysis", () => {
	it("finds the client, its list rank, recommendations and own citations", () => {
		const text =
			"Top plumbers in Christchurch:\n\n1. Southern Pipes — fast response.\n2. Kōwhai Plumbing — great reviews.\n\nAvon Drainage also covers Riccarton.";
		const a = analyseAnswer(
			text,
			[
				{ url: "https://kowhaiplumbing.example.nz/about", domain: "kowhaiplumbing.example.nz" },
				{ url: "https://nocowboys.example/x", domain: "nocowboys.example" },
			],
			brand,
			rivals,
		);
		expect(a.brandMentioned).toBe(true);
		expect(a.brandRank).toBe(2);
		expect(a.brandRecommended).toBe(true);
		expect(a.competitorsMentioned).toEqual(["Southern Pipes", "Avon Drainage"]);
		expect(a.competitorsRecommended).toEqual(["Southern Pipes"]);
		expect(a.ownCitations).toBe(1);
		expect(text.slice(a.spans[1]?.start, a.spans[1]?.end)).toBe("Kōwhai Plumbing");
	});

	it("treats recommending language as a recommendation outside lists", () => {
		expect(analyseAnswer("I would recommend Kōwhai Plumbing for this.", [], brand, rivals).brandRecommended).toBe(true);
		expect(analyseAnswer("Kōwhai Plumbing exists.", [], brand, rivals).brandRecommended).toBe(false);
	});
});

function run(id: string, overrides: Partial<AnalysedRun>): AnalysedRun {
	return {
		runId: id,
		promptId: `p${id}`,
		engine: "gpt",
		collectionMethod: "fixture",
		createdAt: new Date(0),
		branded: false,
		citations: [],
		brandMentioned: false,
		brandRank: null,
		brandRecommended: false,
		competitorsMentioned: [],
		competitorsRecommended: [],
		ownCitations: 0,
		totalCitations: 0,
		spans: [],
		...overrides,
	};
}

describe("visibility summary", () => {
	const runs = [
		run("1", {
			brandMentioned: true,
			brandRank: 2,
			competitorsMentioned: ["Southern Pipes"],
			totalCitations: 2,
			ownCitations: 1,
		}),
		run("2", {
			competitorsMentioned: ["Southern Pipes", "Avon Drainage"],
			competitorsRecommended: ["Southern Pipes"],
			totalCitations: 2,
		}),
		run("3", { engine: "claude", brandMentioned: true, brandRank: 1, brandRecommended: true }),
		run("4", { branded: true, brandMentioned: true }),
	];

	it("excludes branded questions, flags low samples and labels simulation", () => {
		const s = summariseVisibility(runs, ["Southern Pipes", "Avon Drainage"]);
		expect(s.n).toBe(3);
		expect(s.excludedBranded).toBe(1);
		expect(s.visibility).toBe(66.7);
		expect(s.recommendation).toBe(33.3);
		expect(s.averageListPosition).toBe(1.5);
		expect(s.ownCitationShare).toBe(25);
		expect(s.shareOfVoice.score).toBe(40);
		expect(s.competitors[0]).toEqual({ name: "Southern Pipes", mentions: 2, recommendations: 1, visibility: 66.7 });
		expect(s.lowSample).toBe(true);
		expect(s.simulated).toBe(true);
		expect(s.runIds).toEqual(["1", "2", "3"]);
	});

	it("splits by engine and never mixes methods", () => {
		expect(Object.keys(summariseByEngine(runs, []))).toEqual(["claude", "gpt"]);
		expect(() => summariseVisibility([...runs, run("5", { collectionMethod: "model_api_grounded" })], [])).toThrow(
			MixedMethodError,
		);
	});

	it("lists cited sources outside the known domains", () => {
		const cited = [
			run("a", {
				citations: [
					{ url: "u", domain: "www.nocowboys.example" },
					{ url: "u", domain: "kowhaiplumbing.example.nz" },
				],
			}),
			run("b", { citations: [{ url: "v", domain: "nocowboys.example" }] }),
		];
		expect(observedSources(cited, ["kowhaiplumbing.example.nz"])).toEqual([
			{ domain: "nocowboys.example", citations: 2, answers: 2 },
		]);
	});
});
