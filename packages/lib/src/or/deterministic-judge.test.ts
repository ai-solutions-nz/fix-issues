import { describe, expect, it } from "vitest";
import { deterministicAnalyzer } from "./deterministic-judge";

const config = {
	brand: { name: "Kōwhai Plumbing", aliases: ["Kowhai Plumbing"], domains: ["https://www.kowhaiplumbing.example.nz"] },
	competitors: [
		{ name: "Southern Pipes", aliases: [], domains: ["southernpipes.example.nz"] },
		{ name: "Avon Drainage", aliases: [], domains: ["avondrainage.example.nz"] },
	],
};

describe("deterministic mention judge", () => {
	it("finds brand and competitors with order, counts and offsets", async () => {
		const text = "1. Southern Pipes\n2. Kowhai Plumbing (kowhaiplumbing.example.nz)\n\nSouthern Pipes again.";
		const result = await deterministicAnalyzer.analyze(text, config);
		expect(result.brandMentioned).toBe(true);
		expect(result.competitorsMentioned).toEqual(["Southern Pipes"]);
		expect(result.assessments?.brand).toMatchObject({
			mentioned: true,
			position: 2,
			mentionCount: 2,
			firstMention: text.indexOf("Kowhai"),
		});
		expect(result.assessments?.competitors["Southern Pipes"]).toMatchObject({ position: 1, mentionCount: 2 });
		expect(result.assessments?.brand?.sentiment).toBeUndefined();
	});

	it("records fingerprints for every subject, mentioned or not", async () => {
		const result = await deterministicAnalyzer.analyze("Nobody relevant here.", config);
		expect(result.brandMentioned).toBe(false);
		expect(Object.keys(result.assessments?.judged.competitors ?? {})).toEqual(["Southern Pipes", "Avon Drainage"]);
	});

	it("handles a missing answer", async () => {
		expect((await deterministicAnalyzer.analyze(null, config)).brandMentioned).toBe(false);
	});
});
