import { type CollectionMethod, isSimulated, METHOD_LABELS } from "@workspace/or-core/measurement";
import { analyseAnswer } from "@workspace/or-core/visibility";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { brands, citations, promptRuns, prompts, runExtractions } from "../db/schema";
import {
	orApprovals,
	orAuditRuns,
	orCmsConnections,
	orContentItems,
	orOpportunities,
	orPublications,
} from "../db/schema-or";
import { loadSubjects, type MethodReport, visibilityReport } from "./visibility-service";

export interface DashboardData {
	brand: { id: string; name: string; website: string };
	generatedAt: string;
	reports: (MethodReport & { label: string; simulated: boolean })[];
	audit: Pick<
		typeof orAuditRuns.$inferSelect,
		"id" | "status" | "brandCompleteness" | "agentReadiness" | "findings" | "scores" | "pagesAudited" | "completedAt"
	> | null;
	opportunities: (typeof orOpportunities.$inferSelect)[];
	content: Pick<
		typeof orContentItems.$inferSelect,
		"id" | "title" | "kind" | "status" | "version" | "qa" | "opportunityId" | "updatedAt"
	>[];
	approvals: (typeof orApprovals.$inferSelect)[];
	connections: { id: string; label: string; kind: string; baseUrl: string; publishStatus: string }[];
	publications: Pick<
		typeof orPublications.$inferSelect,
		"id" | "contentItemId" | "status" | "remoteUrl" | "publishedAt" | "verification" | "retest"
	>[];
}

/** Everything the Online Reset dashboard shows for one brand, assembled from stored evidence. */
export async function dashboardData(
	conn: DbConnection,
	brandId: string,
	options: { since?: Date } = {},
): Promise<DashboardData> {
	const [brand] = await conn
		.select({ id: brands.id, name: brands.name, website: brands.website })
		.from(brands)
		.where(eq(brands.id, brandId))
		.limit(1);
	if (!brand) throw new Error(`Brand not found: ${brandId}`);
	const reports = (await visibilityReport(conn, brandId, options))
		.map((r) => ({ ...r, label: METHOD_LABELS[r.method], simulated: isSimulated(r.method) }))
		// Live evidence first; simulated last so it is never mistaken for the headline.
		.sort((a, b) => Number(a.simulated) - Number(b.simulated) || b.overall.n - a.overall.n);
	const [audit] = await conn
		.select({
			id: orAuditRuns.id,
			status: orAuditRuns.status,
			brandCompleteness: orAuditRuns.brandCompleteness,
			agentReadiness: orAuditRuns.agentReadiness,
			findings: orAuditRuns.findings,
			scores: orAuditRuns.scores,
			pagesAudited: orAuditRuns.pagesAudited,
			completedAt: orAuditRuns.completedAt,
		})
		.from(orAuditRuns)
		.where(eq(orAuditRuns.brandId, brandId))
		.orderBy(desc(orAuditRuns.startedAt))
		.limit(1);
	return {
		brand,
		generatedAt: new Date().toISOString(),
		reports,
		audit: audit ?? null,
		opportunities: await conn
			.select()
			.from(orOpportunities)
			.where(and(eq(orOpportunities.brandId, brandId), eq(orOpportunities.current, true)))
			.orderBy(desc(orOpportunities.priority)),
		content: await conn
			.select({
				id: orContentItems.id,
				title: orContentItems.title,
				kind: orContentItems.kind,
				status: orContentItems.status,
				version: orContentItems.version,
				qa: orContentItems.qa,
				opportunityId: orContentItems.opportunityId,
				updatedAt: orContentItems.updatedAt,
			})
			.from(orContentItems)
			.where(eq(orContentItems.brandId, brandId))
			.orderBy(desc(orContentItems.updatedAt)),
		approvals: await conn
			.select()
			.from(orApprovals)
			.where(eq(orApprovals.brandId, brandId))
			.orderBy(desc(orApprovals.requestedAt)),
		connections: await conn
			.select({
				id: orCmsConnections.id,
				label: orCmsConnections.label,
				kind: orCmsConnections.kind,
				baseUrl: orCmsConnections.baseUrl,
				publishStatus: orCmsConnections.publishStatus,
			})
			.from(orCmsConnections)
			.where(eq(orCmsConnections.brandId, brandId)),
		publications: await conn
			.select({
				id: orPublications.id,
				contentItemId: orPublications.contentItemId,
				status: orPublications.status,
				remoteUrl: orPublications.remoteUrl,
				publishedAt: orPublications.publishedAt,
				verification: orPublications.verification,
				retest: orPublications.retest,
			})
			.from(orPublications)
			.where(eq(orPublications.brandId, brandId))
			.orderBy(desc(orPublications.createdAt)),
	};
}

export interface RunEvidence {
	runId: string;
	question: string;
	engine: string;
	provider: string | null;
	modelVersion: string;
	collectionMethod: CollectionMethod;
	methodLabel: string;
	simulated: boolean;
	createdAt: string;
	locationRequested: unknown;
	locationApplied: string | null;
	methodologyVersion: string | null;
	text: string | null;
	citations: { url: string; domain: string; title: string | null }[];
	spans: { brand: string; start: number; end: number }[];
	brandMentioned: boolean;
	brandRank: number | null;
}

/** One stored answer with everything needed to check a figure against it. */
export async function runEvidence(conn: DbConnection, brandId: string, runId: string): Promise<RunEvidence> {
	const [row] = await conn
		.select({ run: promptRuns, question: prompts.value, text: runExtractions.textContent })
		.from(promptRuns)
		.innerJoin(prompts, eq(prompts.id, promptRuns.promptId))
		.leftJoin(runExtractions, eq(runExtractions.runId, promptRuns.id))
		.where(and(eq(promptRuns.id, runId), eq(promptRuns.brandId, brandId)))
		.limit(1);
	if (!row) throw new Error("Run not found");
	const cites = await conn
		.select({ url: citations.url, domain: citations.domain, title: citations.title })
		.from(citations)
		.where(inArray(citations.promptRunId, [runId]));
	const subjects = await loadSubjects(conn, brandId);
	const analysis = analyseAnswer(row.text ?? "", cites, subjects.brand, subjects.competitors);
	const method = row.run.collectionMethod as CollectionMethod;
	return {
		runId,
		question: row.question,
		engine: row.run.model,
		provider: row.run.provider,
		modelVersion: row.run.version,
		collectionMethod: method,
		methodLabel: METHOD_LABELS[method],
		simulated: isSimulated(method),
		createdAt: row.run.createdAt.toISOString(),
		locationRequested: row.run.locationRequested,
		locationApplied: row.run.locationApplied,
		methodologyVersion: row.run.methodologyVersion,
		text: row.text,
		citations: cites,
		spans: analysis.spans,
		brandMentioned: analysis.brandMentioned,
		brandRank: analysis.brandRank,
	};
}
