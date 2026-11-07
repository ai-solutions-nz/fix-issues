import { type Finding, pagesCovering } from "@workspace/or-core/audits";
import { LIVE_AUTOMATED_METHODS } from "@workspace/or-core/measurement";
import { buildOpportunities, type Opportunity } from "@workspace/or-core/opportunities";
import type { QuestionIntent } from "@workspace/or-core/questions";
import { and, desc, eq, notInArray } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { orAuditRuns, orOpportunities } from "../db/schema-or";
import { loadAnalysedRuns, loadSubjects, type MethodReport, visibilityReport } from "./visibility-service";

/** Domains cited in answers that recommended a competitor while leaving the client out. */
function competitorOnlySources(runs: Awaited<ReturnType<typeof loadAnalysedRuns>>, known: string[]) {
	const tally = new Map<string, Set<string>>();
	for (const run of runs) {
		if (run.branded || run.brandMentioned || run.competitorsRecommended.length === 0) continue;
		for (const c of run.citations) {
			const d = c.domain.replace(/^www\./, "");
			if (known.some((k) => d === k || d.endsWith(`.${k}`))) continue;
			tally.set(d, (tally.get(d) ?? new Set()).add(run.runId));
		}
	}
	return [...tally.entries()].map(([domain, ids]) => ({ domain, answers: ids.size, runIds: [...ids] }));
}

/** The live method with the most runs; fixtures only when there is no live evidence at all. */
function evidenceMethod(reports: MethodReport[]): MethodReport | null {
	const byRuns = [...reports].sort((a, b) => b.overall.n - a.overall.n);
	return (
		byRuns.find((r) => LIVE_AUTOMATED_METHODS.includes(r.method)) ?? byRuns.find((r) => r.method === "fixture") ?? null
	);
}

/** Recompute a brand's opportunities from its latest audit and visibility evidence, keeping each one's human-set status. */
export async function refreshOpportunities(conn: DbConnection, brandId: string): Promise<Opportunity[]> {
	const [latest] = await conn
		.select()
		.from(orAuditRuns)
		.where(and(eq(orAuditRuns.brandId, brandId), eq(orAuditRuns.status, "completed")))
		.orderBy(desc(orAuditRuns.startedAt))
		.limit(1);
	const reports = await visibilityReport(conn, brandId);
	const chosen = evidenceMethod(reports);
	const subjects = await loadSubjects(conn, brandId);
	const known = [subjects.brand.domain, ...subjects.competitors.map((c) => c.domain).filter((d): d is string => !!d)];
	const sources = chosen
		? competitorOnlySources(await loadAnalysedRuns(conn, brandId, { method: chosen.method }), known)
		: [];
	const outline = (latest?.pageOutline ?? []).map((p) => ({ ...p, metaDescription: "", text: "", jsonLd: [] }));
	const pageFindings = (latest?.findings ?? []) as Finding[];
	const opportunities = buildOpportunities({
		questions: (chosen?.questions ?? []).map((q) => ({ ...q, intent: q.intent as QuestionIntent | null })),
		findings: pageFindings,
		competitorOnlySources: sources,
		pagesForQuestion: (question) => pagesCovering(outline, question),
	});
	for (const o of opportunities) {
		const values = {
			type: o.type,
			title: o.title,
			rationale: o.rationale,
			recommendedAction: o.recommendedAction,
			priority: o.priority,
			components: { ...o.components },
			evidence: o.evidence,
			collectionMethod: chosen?.method ?? null,
			auditRunId: latest?.id ?? null,
			current: true,
		};
		await conn
			.insert(orOpportunities)
			.values({ brandId, opportunityId: o.id, ...values })
			.onConflictDoUpdate({ target: [orOpportunities.brandId, orOpportunities.opportunityId], set: values });
	}
	const ids = opportunities.map((o) => o.id);
	await conn
		.update(orOpportunities)
		.set({ current: false })
		.where(
			ids.length
				? and(eq(orOpportunities.brandId, brandId), notInArray(orOpportunities.opportunityId, ids))
				: eq(orOpportunities.brandId, brandId),
		);
	return opportunities;
}
