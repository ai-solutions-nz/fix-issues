// Adapted from Canonry packages/intelligence/src/share-of-voice-frame.ts at
// f5d4612e23d2b1f0e5f46b217245359125c52a80. Copyright (c) 2026 Arber X and
// contributors, MIT (see THIRD_PARTY_NOTICES.md). Modified for Online Reset.
import { percentOf } from "./measurement";

/**
 * Publication floors: three rivals each seen in three distinct answers rules
 * out a lone alternative or a one-answer list. A floor, not a confidence interval.
 */
export const MIN_OBSERVED_COMPETITORS = 3;
export const MIN_OBSERVED_ANSWERS = 3;

export type ShareOfVoiceReason = "no-competitors" | "insufficient-observed" | "no-answers" | "no-mentions" | null;

export interface ShareOfVoice {
	basis: "tracked" | "observed" | null;
	reason: ShareOfVoiceReason;
	availability: "measured" | "not-measured";
	/** Percentage, or null when not measured. */
	score: number | null;
	denominator: number;
	competitorMentions: number;
	competitors: string[];
}

/**
 * Answers mentioning the client over answers mentioning the client or a
 * competitor. Tracked competitors always count; observed (untracked) ones
 * count only when each was seen in at least MIN_OBSERVED_ANSWERS answers.
 */
export function shareOfVoice(input: {
	tracked: boolean;
	brandMentions: number;
	answeredResults: number;
	competitors: readonly { name: string; mentions: number }[];
}): ShareOfVoice {
	const selected = input.tracked
		? input.competitors
		: input.competitors.filter((c) => c.mentions >= MIN_OBSERVED_ANSWERS);
	const competitorMentions = selected.reduce((sum, c) => sum + c.mentions, 0);
	const denominator = input.brandMentions + competitorMentions;
	const basis = input.tracked ? "tracked" : input.competitors.length > 0 ? "observed" : null;
	const reason: ShareOfVoiceReason =
		basis === null
			? "no-competitors"
			: !input.tracked && selected.length < MIN_OBSERVED_COMPETITORS
				? "insufficient-observed"
				: input.answeredResults === 0
					? "no-answers"
					: denominator === 0
						? "no-mentions"
						: null;
	return {
		basis,
		reason,
		availability: reason === null ? "measured" : "not-measured",
		score: reason === null ? percentOf(input.brandMentions, denominator) : null,
		denominator,
		competitorMentions,
		competitors: selected.map((c) => c.name),
	};
}
