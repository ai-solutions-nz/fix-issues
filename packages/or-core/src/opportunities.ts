import { createHash } from "node:crypto";
import type { Finding } from "./audits";
import type { QuestionIntent } from "./questions";

/**
 * Prioritised opportunities, each traceable to the runs and findings behind
 * it. priority = demand × gap × winnability × commercial value × confidence
 * (docs/research/09-competitive-differentiation.md §3). The expected effect is
 * a hypothesis; only a retest under the same method measures it.
 */
export interface QuestionEvidence {
	promptId: string;
	question: string;
	intent: QuestionIntent | null;
	runs: number;
	brandMentioned: number;
	recommendedCompetitors: string[];
	runIds: string[];
}

export interface OpportunityComponents {
	demand: number;
	gap: number;
	winnability: number;
	commercialValue: number;
	confidence: number;
}

export interface Opportunity {
	id: string;
	type: "ai_answer_gap" | "citation_source" | "technical_fix" | "content_gap";
	title: string;
	rationale: string;
	recommendedAction: string;
	priority: number;
	components: OpportunityComponents;
	evidence: { runIds: string[]; findingIds: string[]; sources: string[]; promptIds: string[] };
	/** Always true: the improvement is expected, not proven, until retested. */
	isHypothesis: true;
}

const INTENT_DEMAND: Record<QuestionIntent, number> = {
	urgent: 1,
	discovery: 0.9,
	service: 0.85,
	local: 0.75,
	price: 0.7,
	comparison: 0.6,
	trust: 0.55,
	brand: 0.3,
};

const SEVERITY_DEMAND = { high: 0.9, medium: 0.6, low: 0.3 } as const;

/** Six runs per question is where one more answer stops swinging the share by more than about 15 points. */
const FULL_CONFIDENCE_RUNS = 6;

const stableId = (...parts: string[]) => createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 16);
const round = (n: number) => Math.round(n * 1000) / 1000;

function priorityOf(c: OpportunityComponents): number {
	return Math.round(c.demand * c.gap * c.winnability * c.commercialValue * c.confidence * 100 * 10) / 10;
}

export interface OpportunityInput {
	questions: readonly QuestionEvidence[];
	findings: readonly Finding[];
	/** Domains cited in answers that recommended a competitor and not the client. */
	competitorOnlySources: readonly { domain: string; answers: number; runIds: string[] }[];
	/** Relative value of each service to the business (1 = baseline); defaults to 1. */
	serviceValue?: Record<string, number>;
	/** URLs of client pages relevant to a question; empty when none. */
	pagesForQuestion: (question: string) => string[];
}

function valueFor(serviceValue: Record<string, number> | undefined, text: string): number {
	const match = Object.entries(serviceValue ?? {}).find(([service]) =>
		text.toLowerCase().includes(service.toLowerCase()),
	);
	return match ? match[1] : 1;
}

function questionOpportunity(q: QuestionEvidence, input: OpportunityInput): Opportunity | null {
	if (q.intent === "brand" || q.runs === 0) return null;
	const gap = 1 - q.brandMentioned / q.runs;
	if (gap === 0) return null;
	const pages = input.pagesForQuestion(q.question);
	const c: OpportunityComponents = {
		demand: INTENT_DEMAND[q.intent ?? "discovery"],
		gap: round(gap),
		winnability: pages.length > 0 ? 0.7 : 0.5,
		commercialValue: valueFor(input.serviceValue, q.question),
		confidence: round(Math.min(1, q.runs / FULL_CONFIDENCE_RUNS)),
	};
	const rivals = q.recommendedCompetitors.length
		? ` AI answers recommended ${q.recommendedCompetitors.join(", ")} instead.`
		: "";
	return {
		id: stableId("ai_answer_gap", q.promptId),
		type: "ai_answer_gap",
		title: `Not recommended for "${q.question}"`,
		rationale: `The business was mentioned in ${q.brandMentioned} of ${q.runs} answers.${rivals}`,
		recommendedAction: pages.length
			? `Strengthen ${pages[0]} to answer this question directly, then retest.`
			: "Create a page that answers this question directly (service, location, price guidance, proof), then retest.",
		priority: priorityOf(c),
		components: c,
		evidence: { runIds: q.runIds, findingIds: [], sources: [], promptIds: [q.promptId] },
		isHypothesis: true,
	};
}

function sourceOpportunity(s: OpportunityInput["competitorOnlySources"][number]): Opportunity {
	const c: OpportunityComponents = {
		demand: 0.7,
		gap: 1,
		winnability: 0.4,
		commercialValue: 1,
		confidence: round(Math.min(1, s.answers / 3)),
	};
	return {
		id: stableId("citation_source", s.domain),
		type: "citation_source",
		title: `Be present on ${s.domain}`,
		rationale: `${s.domain} was cited in ${s.answers} answer(s) that recommended a competitor and not the business.`,
		recommendedAction: `Check whether the business is listed and accurate on ${s.domain}; claim or correct the listing through legitimate means.`,
		priority: priorityOf(c),
		components: c,
		evidence: { runIds: s.runIds, findingIds: [], sources: [s.domain], promptIds: [] },
		isHypothesis: true,
	};
}

function findingOpportunity(f: Finding, input: OpportunityInput): Opportunity {
	const type = f.category === "competitor_gap" || f.category === "intent_coverage" ? "content_gap" : "technical_fix";
	const c: OpportunityComponents = {
		demand: SEVERITY_DEMAND[f.severity],
		gap: f.status === "fail" ? 1 : 0.5,
		winnability: type === "technical_fix" ? 0.9 : 0.6,
		commercialValue: valueFor(input.serviceValue, f.title),
		confidence: 1,
	};
	return {
		id: stableId("finding", f.id),
		type,
		title: f.title.startsWith("A page covers")
			? `Missing page: ${f.title.slice("A page covers ".length)}`
			: `Fix: ${f.title}`,
		rationale: f.evidence,
		recommendedAction: f.fix ?? "Review the finding.",
		priority: priorityOf(c),
		components: c,
		evidence: { runIds: [], findingIds: [f.id], sources: [], promptIds: [] },
		isHypothesis: true,
	};
}

export function buildOpportunities(input: OpportunityInput): Opportunity[] {
	return [
		...input.questions.map((q) => questionOpportunity(q, input)).filter((o): o is Opportunity => o !== null),
		...input.competitorOnlySources.map(sourceOpportunity),
		...input.findings.filter((f) => f.status !== "pass").map((f) => findingOpportunity(f, input)),
	].sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));
}
