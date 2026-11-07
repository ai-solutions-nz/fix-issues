import { type CollectionMethod, isSimulated, percentOf, requireSingleMethod } from "./measurement";
import { type Brand, Matcher, normalizeKey } from "./mentions";
import { type ShareOfVoice, shareOfVoice } from "./share-of-voice";

export interface Citation {
	url: string;
	domain: string;
}

export interface AnswerAnalysis {
	brandMentioned: boolean;
	/** Best (lowest) list rank of the client brand, or null. */
	brandRank: number | null;
	/** Mentioned inside a ranked list or beside recommending language. */
	brandRecommended: boolean;
	competitorsMentioned: string[];
	competitorsRecommended: string[];
	ownCitations: number;
	totalCitations: number;
	/** Byte spans of every brand mention, for evidence highlighting. */
	spans: { brand: string; start: number; end: number }[];
}

const RECOMMEND =
	/\b(recommend(ed)?|top (choice|pick)|best (option|choice|bet)|go with|highly rated|worth (calling|contacting|considering)|stand(s)? out)\b/i;

function sentenceAround(text: string, start: number, end: number): string {
	const before = text.lastIndexOf(".", start);
	const nl = text.lastIndexOf("\n", start);
	const from = Math.max(before, nl) + 1;
	const stops = [text.indexOf(".", end), text.indexOf("\n", end)].filter((i) => i >= 0);
	return text.slice(from, stops.length ? Math.min(...stops) : text.length);
}

/** Deterministic analysis of one answer; recomputable from the stored text. */
export function analyseAnswer(
	text: string,
	citations: readonly Citation[],
	brand: Brand,
	competitors: readonly Brand[],
): AnswerAnalysis {
	const matcher = new Matcher([{ ...brand, competitorId: null }, ...competitors]);
	const mentions = matcher.find(text);
	const brandKey = normalizeKey(brand.name);
	const own = mentions.filter((m) => m.competitorId === null);
	const recommended = (m: (typeof mentions)[number]) =>
		m.listRank !== null || RECOMMEND.test(sentenceAround(text, m.start, m.end));
	const ranks = own.map((m) => m.listRank).filter((r): r is number => r !== null);
	const ownDomains = [brand.domain, ...(brand.aliases ?? [])]
		.filter(Boolean)
		.map((d) => (d as string).toLowerCase().replace(/^www\./, ""));
	const compNames = (list: typeof mentions) => [
		...new Set(list.filter((m) => m.competitorId !== null && m.brandKey !== brandKey).map((m) => m.brandName)),
	];
	return {
		brandMentioned: own.length > 0,
		brandRank: ranks.length ? Math.min(...ranks) : null,
		brandRecommended: own.some(recommended),
		competitorsMentioned: compNames(mentions),
		competitorsRecommended: compNames(mentions.filter(recommended)),
		ownCitations: citations.filter((c) =>
			ownDomains.some((d) =>
				c.domain
					.toLowerCase()
					.replace(/^www\./, "")
					.endsWith(d),
			),
		).length,
		totalCitations: citations.length,
		spans: mentions.map((m) => ({ brand: m.brandName, start: m.start, end: m.end })),
	};
}

export interface AnalysedRun extends AnswerAnalysis {
	runId: string;
	promptId: string;
	engine: string;
	collectionMethod: CollectionMethod;
	createdAt: Date;
	/** The question itself names the client; excluded from headline figures. */
	branded: boolean;
	citations: Citation[];
}

/** Below this many runs a rate is shown with an explicit low-sample warning. */
export const MIN_RUNS_FOR_STABLE_RATE = 20;

export interface VisibilitySummary {
	collectionMethod: CollectionMethod | null;
	simulated: boolean;
	/** Non-branded runs the figures are computed from. */
	n: number;
	excludedBranded: number;
	lowSample: boolean;
	/** % of answers mentioning the client. */
	visibility: number | null;
	/** % of answers recommending the client. */
	recommendation: number | null;
	averageListPosition: number | null;
	shareOfVoice: ShareOfVoice;
	/** % of all citations that point at the client's own domains. */
	ownCitationShare: number | null;
	competitors: { name: string; mentions: number; recommendations: number; visibility: number | null }[];
	runIds: string[];
}

/** Headline figures for one collection method. Throws on mixed methods rather than averaging across them. */
export function summariseVisibility(
	runs: readonly AnalysedRun[],
	trackedCompetitors: readonly string[],
): VisibilitySummary {
	const method = requireSingleMethod(runs);
	const counted = runs.filter((r) => !r.branded);
	const n = counted.length;
	const mentioned = counted.filter((r) => r.brandMentioned);
	const ranks = counted.map((r) => r.brandRank).filter((r): r is number => r !== null);
	const competitors = trackedCompetitors.map((name) => {
		const mentions = counted.filter((r) => r.competitorsMentioned.includes(name)).length;
		return {
			name,
			mentions,
			recommendations: counted.filter((r) => r.competitorsRecommended.includes(name)).length,
			visibility: percentOf(mentions, n),
		};
	});
	const totalCitations = counted.reduce((s, r) => s + r.totalCitations, 0);
	return {
		collectionMethod: method,
		simulated: method !== null && isSimulated(method),
		n,
		excludedBranded: runs.length - n,
		lowSample: n < MIN_RUNS_FOR_STABLE_RATE,
		visibility: percentOf(mentioned.length, n),
		recommendation: percentOf(counted.filter((r) => r.brandRecommended).length, n),
		averageListPosition: ranks.length ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10 : null,
		shareOfVoice: shareOfVoice({
			tracked: true,
			brandMentions: mentioned.length,
			answeredResults: n,
			competitors: competitors.map((c) => ({ name: c.name, mentions: c.mentions })),
		}),
		ownCitationShare: percentOf(
			counted.reduce((s, r) => s + r.ownCitations, 0),
			totalCitations,
		),
		competitors: competitors.sort((a, b) => b.mentions - a.mentions),
		runIds: counted.map((r) => r.runId),
	};
}

/** Per-engine summaries within one method. */
export function summariseByEngine(
	runs: readonly AnalysedRun[],
	trackedCompetitors: readonly string[],
): Record<string, VisibilitySummary> {
	requireSingleMethod(runs);
	const engines = [...new Set(runs.map((r) => r.engine))].sort();
	return Object.fromEntries(
		engines.map((e) => [
			e,
			summariseVisibility(
				runs.filter((r) => r.engine === e),
				trackedCompetitors,
			),
		]),
	);
}

/** Domains the engines cite that belong to neither the client nor a tracked competitor: candidate competitors and citation sources. */
export function observedSources(
	runs: readonly AnalysedRun[],
	knownDomains: readonly string[],
): { domain: string; citations: number; answers: number }[] {
	requireSingleMethod(runs);
	const known = knownDomains.map((d) => d.toLowerCase().replace(/^www\./, ""));
	const tally = new Map<string, { citations: number; answers: Set<string> }>();
	for (const run of runs) {
		for (const c of run.citations) {
			const d = c.domain.toLowerCase().replace(/^www\./, "");
			if (known.some((k) => d === k || d.endsWith(`.${k}`))) continue;
			const entry = tally.get(d) ?? { citations: 0, answers: new Set<string>() };
			entry.citations++;
			entry.answers.add(run.runId);
			tally.set(d, entry);
		}
	}
	return [...tally.entries()]
		.map(([domain, v]) => ({ domain, citations: v.citations, answers: v.answers.size }))
		.sort((a, b) => b.answers - a.answers || b.citations - a.citations || a.domain.localeCompare(b.domain));
}
