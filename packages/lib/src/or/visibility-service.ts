import { cosineSimilarity, HASH_EMBEDDING_MODEL, hashEmbedding } from "@workspace/or-core/clustering";
import type { CollectionMethod } from "@workspace/or-core/measurement";
import { isBranded } from "@workspace/or-core/mentions";
import {
	type BusinessContext,
	clusterQuestions,
	generateBuyerQuestions,
	validateQuestion,
} from "@workspace/or-core/questions";
import {
	type AnalysedRun,
	analyseAnswer,
	observedSources,
	summariseByEngine,
	summariseVisibility,
	type VisibilitySummary,
} from "@workspace/or-core/visibility";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { brands, citations, competitors, promptRuns, prompts, runExtractions } from "../db/schema";
import { orPromptMeta } from "../db/schema-or";

function hostOf(url: string): string {
	try {
		return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

export interface BrandSubjects {
	brand: { competitorId: null; name: string; aliases: string[]; domain: string };
	competitors: { competitorId: string; name: string; aliases: string[]; domain: string | undefined }[];
}

export async function loadSubjects(conn: DbConnection, brandId: string): Promise<BrandSubjects> {
	const [brand] = await conn.select().from(brands).where(eq(brands.id, brandId)).limit(1);
	if (!brand) throw new Error(`Brand not found: ${brandId}`);
	const rivals = await conn
		.select()
		.from(competitors)
		.where(eq(competitors.brandId, brandId))
		.orderBy(asc(competitors.name));
	return {
		brand: { competitorId: null, name: brand.name, aliases: brand.aliases ?? [], domain: hostOf(brand.website) },
		competitors: rivals.map((c) => ({
			competitorId: c.id,
			name: c.name,
			aliases: c.aliases ?? [],
			domain: c.domains[0] ? hostOf(c.domains[0]) : undefined,
		})),
	};
}

/**
 * Every run for a brand, re-analysed from its stored text and citations. The
 * analysis is deterministic, so these figures can always be recomputed from
 * the evidence and will come out the same.
 */
export async function loadAnalysedRuns(
	conn: DbConnection,
	brandId: string,
	options: { since?: Date; method?: CollectionMethod } = {},
): Promise<AnalysedRun[]> {
	const subjects = await loadSubjects(conn, brandId);
	const conditions = [eq(promptRuns.brandId, brandId)];
	if (options.since) conditions.push(gte(promptRuns.createdAt, options.since));
	if (options.method) conditions.push(eq(promptRuns.collectionMethod, options.method));
	const rows = await conn
		.select({
			id: promptRuns.id,
			promptId: promptRuns.promptId,
			model: promptRuns.model,
			collectionMethod: promptRuns.collectionMethod,
			createdAt: promptRuns.createdAt,
			question: prompts.value,
			text: runExtractions.textContent,
		})
		.from(promptRuns)
		.innerJoin(prompts, eq(prompts.id, promptRuns.promptId))
		.leftJoin(runExtractions, eq(runExtractions.runId, promptRuns.id))
		.where(and(...conditions))
		.orderBy(asc(promptRuns.createdAt));
	const runIds = rows.map((r) => r.id);
	const cites = runIds.length
		? await conn
				.select({ runId: citations.promptRunId, url: citations.url, domain: citations.domain })
				.from(citations)
				.where(inArray(citations.promptRunId, runIds))
		: [];
	const citesByRun = new Map<string, { url: string; domain: string }[]>();
	for (const c of cites) {
		const list = citesByRun.get(c.runId) ?? [];
		list.push({ url: c.url, domain: c.domain });
		citesByRun.set(c.runId, list);
	}
	return rows.map((row) => {
		const runCitations = citesByRun.get(row.id) ?? [];
		return {
			runId: row.id,
			promptId: row.promptId,
			engine: row.model,
			collectionMethod: row.collectionMethod as CollectionMethod,
			createdAt: row.createdAt,
			branded: isBranded(row.question, subjects.brand),
			citations: runCitations,
			...analyseAnswer(row.text ?? "", runCitations, subjects.brand, subjects.competitors),
		};
	});
}

export interface MethodReport {
	method: CollectionMethod;
	overall: VisibilitySummary;
	byEngine: Record<string, VisibilitySummary>;
	sources: ReturnType<typeof observedSources>;
	weekly: { weekStart: string; summary: VisibilitySummary }[];
	questions: QuestionCoverage[];
}

export interface QuestionCoverage {
	promptId: string;
	question: string;
	intent: string | null;
	runs: number;
	brandMentioned: number;
	recommendedCompetitors: string[];
	runIds: string[];
}

function weekStart(d: Date): string {
	const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
	day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
	return day.toISOString().slice(0, 10);
}

/** One report per collection method; methods are never combined. */
export async function visibilityReport(
	conn: DbConnection,
	brandId: string,
	options: { since?: Date } = {},
): Promise<MethodReport[]> {
	const subjects = await loadSubjects(conn, brandId);
	const runs = await loadAnalysedRuns(conn, brandId, options);
	const tracked = subjects.competitors.map((c) => c.name);
	const known = [subjects.brand.domain, ...subjects.competitors.map((c) => c.domain).filter((d): d is string => !!d)];
	const meta = await conn
		.select({ promptId: orPromptMeta.promptId, intent: orPromptMeta.intent })
		.from(orPromptMeta)
		.where(eq(orPromptMeta.brandId, brandId));
	const intentOf = new Map(meta.map((m) => [m.promptId, m.intent]));
	const questionText = new Map(
		(await conn.select({ id: prompts.id, value: prompts.value }).from(prompts).where(eq(prompts.brandId, brandId))).map(
			(p) => [p.id, p.value],
		),
	);
	const methods = [...new Set(runs.map((r) => r.collectionMethod))];
	return methods.map((method) => {
		const mine = runs.filter((r) => r.collectionMethod === method);
		const weeks = [...new Set(mine.map((r) => weekStart(r.createdAt)))].sort();
		const byPrompt = new Map<string, AnalysedRun[]>();
		for (const r of mine) byPrompt.set(r.promptId, [...(byPrompt.get(r.promptId) ?? []), r]);
		return {
			method,
			overall: summariseVisibility(mine, tracked),
			byEngine: summariseByEngine(mine, tracked),
			sources: observedSources(mine, known),
			weekly: weeks.map((w) => ({
				weekStart: w,
				summary: summariseVisibility(
					mine.filter((r) => weekStart(r.createdAt) === w),
					tracked,
				),
			})),
			questions: [...byPrompt.entries()].map(([promptId, list]) => ({
				promptId,
				question: questionText.get(promptId) ?? "",
				intent: intentOf.get(promptId) ?? null,
				runs: list.length,
				brandMentioned: list.filter((r) => r.brandMentioned).length,
				recommendedCompetitors: [...new Set(list.flatMap((r) => r.competitorsRecommended))],
				runIds: list.map((r) => r.runId),
			})),
		};
	});
}

const DUPLICATE_THRESHOLD = 0.85;

export interface SeedResult {
	created: number;
	rejected: { text: string; reasons: string[] }[];
	mergedDuplicates: number;
}

/**
 * Generate, validate and de-duplicate buyer questions for a brand, then store
 * the accepted ones as tracked prompts with their intent, cluster and
 * embedding. Existing questions are left alone.
 */
export async function seedBuyerQuestions(
	conn: DbConnection,
	brandId: string,
	ctx: BusinessContext,
	limit = 30,
): Promise<SeedResult> {
	const existing = (await conn.select({ value: prompts.value }).from(prompts).where(eq(prompts.brandId, brandId))).map(
		(p) => hashEmbedding(p.value),
	);
	// A candidate close to a question already tracked is a rewording of it, not a new question.
	const generated = generateBuyerQuestions(ctx).filter((q) => {
		const v = hashEmbedding(q.text);
		return !existing.some((e) => cosineSimilarity(e, v) >= DUPLICATE_THRESHOLD);
	});
	const rejected: SeedResult["rejected"] = [];
	const accepted = generated.filter((q) => {
		const v = validateQuestion(q, ctx);
		if (v.status === "rejected") rejected.push({ text: q.text, reasons: v.reasons });
		return v.status === "accepted";
	});
	const clusters = clusterQuestions(
		accepted.map((q) => q.text),
		{ threshold: DUPLICATE_THRESHOLD },
	);
	const chosen = clusters
		.map((c) => accepted.find((q) => q.text === c.representative))
		.filter((q) => q !== undefined)
		.slice(0, limit);
	let created = 0;
	for (const q of chosen) {
		const [row] = await conn
			.insert(prompts)
			.values({ brandId, value: q.text, tags: [q.intent] })
			.returning({ id: prompts.id });
		if (!row) continue;
		await conn.insert(orPromptMeta).values({
			promptId: row.id,
			brandId,
			intent: q.intent,
			clusterId: crypto.randomUUID(),
			clusterLabel: q.text,
			embedding: hashEmbedding(q.text),
			embeddingModel: HASH_EMBEDDING_MODEL,
			validation: { status: "accepted", reasons: [] },
			source: "template",
		});
		created++;
	}
	return { created, rejected, mergedDuplicates: accepted.length - clusters.length };
}
