import { describe, expect, it } from "vitest";
import { type BusinessContext, clusterQuestions, generateBuyerQuestions, validateQuestion } from "./questions";

const ctx: BusinessContext = {
	brand: "Kōwhai Plumbing",
	brandDomain: "kowhaiplumbing.example.nz",
	trade: "plumber",
	services: ["Hot water cylinder replacement", "Blocked drains"],
	city: "Christchurch",
	suburbs: ["Riccarton", "Papanui"],
	competitors: ["Southern Pipes"],
};

describe("buyer questions", () => {
	it("generates intent-diverse, location-specific questions deterministically", () => {
		const qs = generateBuyerQuestions(ctx);
		expect(qs).toEqual(generateBuyerQuestions(ctx));
		expect(new Set(qs.map((q) => q.intent))).toEqual(
			new Set(["discovery", "urgent", "price", "trust", "service", "local", "comparison", "brand"]),
		);
		expect(
			qs.filter((q) => q.intent !== "brand" && q.intent !== "trust").every((q) => q.text.includes("Christchurch")),
		).toBe(true);
		expect(qs.filter((q) => q.branded).map((q) => q.intent)).toEqual(["brand", "brand"]);
	});

	it("rejects irrelevant or unlocated questions with reasons", () => {
		expect(
			validateQuestion({ text: "Who is the best plumber in Christchurch?", intent: "discovery", branded: false }, ctx)
				.status,
		).toBe("accepted");
		const offTopic = validateQuestion(
			{ text: "Best pizza in Christchurch tonight", intent: "discovery", branded: false },
			ctx,
		);
		expect(offTopic.reasons).toContain("does not mention the trade or a service the business offers");
		expect(
			validateQuestion({ text: "Who is the best plumber around?", intent: "discovery", branded: false }, ctx).reasons,
		).toContain("local question without a location");
	});

	it("merges near-duplicate questions", () => {
		const clusters = clusterQuestions([
			"Best plumber in Christchurch",
			"best plumbers Christchurch",
			"Plumber cost Christchurch hourly rate",
		]);
		expect(clusters).toHaveLength(2);
		expect(clusters[0]?.members).toHaveLength(2);
	});
});
