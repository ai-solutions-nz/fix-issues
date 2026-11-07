import { describe, expect, it } from "vitest";
import { shareOfVoice } from "./share-of-voice";

describe("share of voice (Canonry frame)", () => {
	it("measures tracked competitors directly", () => {
		const sov = shareOfVoice({
			tracked: true,
			brandMentions: 3,
			answeredResults: 10,
			competitors: [
				{ name: "A", mentions: 6 },
				{ name: "B", mentions: 1 },
			],
		});
		expect(sov.availability).toBe("measured");
		expect(sov.score).toBe(30);
		expect(sov.denominator).toBe(10);
	});

	it("does not publish observed share of voice on thin evidence", () => {
		const sov = shareOfVoice({
			tracked: false,
			brandMentions: 2,
			answeredResults: 10,
			competitors: [
				{ name: "A", mentions: 5 },
				{ name: "B", mentions: 2 },
			],
		});
		expect(sov.reason).toBe("insufficient-observed");
		expect(sov.score).toBeNull();
	});

	it("says why it is not measured", () => {
		expect(
			shareOfVoice({ tracked: true, brandMentions: 0, answeredResults: 0, competitors: [{ name: "A", mentions: 0 }] })
				.reason,
		).toBe("no-answers");
		expect(
			shareOfVoice({ tracked: true, brandMentions: 0, answeredResults: 4, competitors: [{ name: "A", mentions: 0 }] })
				.reason,
		).toBe("no-mentions");
		expect(shareOfVoice({ tracked: false, brandMentions: 1, answeredResults: 4, competitors: [] }).reason).toBe(
			"no-competitors",
		);
	});
});
