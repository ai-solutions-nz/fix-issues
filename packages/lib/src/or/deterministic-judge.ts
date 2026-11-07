import { type Brand as MatchBrand, Matcher } from "@workspace/or-core/mentions";
import type { MentionAnalyzer, RunMentions } from "../mention-judge/analyze";
import { type MentionAssessment, type MentionConfig, subjectFingerprint } from "../mentions";

/** Part of the mentions stamp: bump when matching rules change so history is re-derived. */
export const DETERMINISTIC_JUDGE_VERSION = "or-deterministic-1";

function host(domain: string): string {
	const d = domain.trim().toLowerCase();
	try {
		return new URL(d.includes("://") ? d : `https://${d}`).hostname.replace(/^www\./, "");
	} catch {
		return d.replace(/^www\./, "");
	}
}

function toMatchBrands(subject: MentionConfig["brand"], competitorId: string | null): MatchBrand[] {
	const [primary, ...extra] = subject.domains.map(host).filter(Boolean);
	// Extra domains become extra brand entries with the same name, so each counts as the brand.
	return [
		{ competitorId, name: subject.name, aliases: subject.aliases, domain: primary },
		...extra.map((domain) => ({ competitorId, name: subject.name, aliases: [], domain })),
	];
}

/**
 * Online Reset's default judge: the Limelit text matcher (packages/or-core).
 * It makes no network call and costs nothing, and the same stored text always
 * gives the same result. It does not judge sentiment (left undefined) and
 * reports a literal occurrence even in "I have no information about X".
 */
export const deterministicAnalyzer: MentionAnalyzer = {
	judgeVersion: DETERMINISTIC_JUDGE_VERSION,
	concurrency: 16,
	async analyze(text: string | null, config: MentionConfig): Promise<RunMentions> {
		const judged = {
			brand: subjectFingerprint(config.brand, DETERMINISTIC_JUDGE_VERSION),
			competitors: Object.fromEntries(
				config.competitors.map((c) => [c.name, subjectFingerprint(c, DETERMINISTIC_JUDGE_VERSION)]),
			),
		};
		if (!text) return { brandMentioned: false, competitorsMentioned: [], assessments: { competitors: {}, judged } };
		const matcher = new Matcher([
			...toMatchBrands(config.brand, null),
			...config.competitors.flatMap((c) => toMatchBrands(c, c.name)),
		]);
		const mentions = matcher.find(text);
		const bySubject = new Map<string | null, MentionAssessment>();
		for (const m of mentions) {
			const current = bySubject.get(m.competitorId);
			if (current) current.mentionCount = (current.mentionCount ?? 1) + 1;
			else bySubject.set(m.competitorId, { mentioned: true, probability: 1, firstMention: m.start, mentionCount: 1 });
		}
		[...bySubject.values()]
			.sort((a, b) => (a.firstMention ?? 0) - (b.firstMention ?? 0))
			.forEach((record, i) => {
				record.position = i + 1;
			});
		const competitors: Record<string, MentionAssessment> = {};
		for (const [key, record] of bySubject) if (key !== null) competitors[key] = record;
		const brand = bySubject.get(null);
		return {
			brandMentioned: brand !== undefined,
			competitorsMentioned: Object.keys(competitors),
			assessments: { ...(brand ? { brand } : {}), competitors, judged },
		};
	},
};
