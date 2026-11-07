import { describe, expect, it } from "vitest";
import { buildOpportunities } from "./opportunities";

describe("opportunity scoring", () => {
	const base = {
		questions: [
			{
				promptId: "p1",
				question: "Emergency plumber in Christchurch",
				intent: "urgent" as const,
				runs: 6,
				brandMentioned: 0,
				recommendedCompetitors: ["Southern Pipes"],
				runIds: ["r1", "r2"],
			},
			{
				promptId: "p2",
				question: "How much does a plumber cost in Christchurch?",
				intent: "price" as const,
				runs: 2,
				brandMentioned: 1,
				recommendedCompetitors: [],
				runIds: ["r3"],
			},
			{
				promptId: "p3",
				question: "Is Kōwhai reliable?",
				intent: "brand" as const,
				runs: 4,
				brandMentioned: 0,
				recommendedCompetitors: [],
				runIds: ["r4"],
			},
			{
				promptId: "p4",
				question: "Best plumber",
				intent: "discovery" as const,
				runs: 3,
				brandMentioned: 3,
				recommendedCompetitors: [],
				runIds: ["r5"],
			},
		],
		findings: [
			{
				id: "schema.local_business",
				category: "structured_data" as const,
				status: "fail" as const,
				severity: "high" as const,
				title: "LocalBusiness structured data is present",
				evidence: "none",
				fix: "add it",
				pages: [],
			},
			{
				id: "content.h1",
				category: "content_quality" as const,
				status: "pass" as const,
				severity: "low" as const,
				title: "ok",
				evidence: "",
				pages: [],
			},
		],
		competitorOnlySources: [{ domain: "nocowboys.example", answers: 3, runIds: ["r1"] }],
		pagesForQuestion: () => [],
	};

	it("ranks by the five components and keeps evidence", () => {
		const ops = buildOpportunities(base);
		expect(ops.map((o) => o.type)).toEqual(["technical_fix", "ai_answer_gap", "citation_source", "ai_answer_gap"]);
		const urgent = ops.find((o) => o.evidence.promptIds.includes("p1"));
		expect(urgent?.components).toEqual({ demand: 1, gap: 1, winnability: 0.5, commercialValue: 1, confidence: 1 });
		expect(urgent?.priority).toBe(50);
		expect(urgent?.evidence.runIds).toEqual(["r1", "r2"]);
		expect(urgent?.rationale).toContain("Southern Pipes");
		expect(ops.every((o) => o.isHypothesis)).toBe(true);
	});

	it("skips branded questions, fully visible questions and passed findings, and down-weights thin evidence", () => {
		const ops = buildOpportunities(base);
		expect(ops.some((o) => o.evidence.promptIds.includes("p3") || o.evidence.promptIds.includes("p4"))).toBe(false);
		expect(ops.some((o) => o.evidence.findingIds.includes("content.h1"))).toBe(false);
		expect(ops.find((o) => o.evidence.promptIds.includes("p2"))?.components.confidence).toBe(0.333);
	});

	it("weights by service value and gives stable ids", () => {
		const valued = buildOpportunities({ ...base, serviceValue: { emergency: 2 } });
		expect(valued.find((o) => o.evidence.promptIds.includes("p1"))?.priority).toBe(100);
		expect(buildOpportunities(base).map((o) => o.id)).toEqual(buildOpportunities(base).map((o) => o.id));
	});
});
