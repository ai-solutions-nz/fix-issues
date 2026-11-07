import {
	type AuditPage,
	auditBrandIdentity,
	auditCompetitorGap,
	auditContentQuality,
	auditIntentCoverage,
	auditStructuredData,
	type BrandProfileFacts,
	brandCompleteness,
	type Finding,
	pagesCovering,
	scoreFindings,
} from "@workspace/or-core/audits";
import { LIVE_AUTOMATED_METHODS } from "@workspace/or-core/measurement";
import { buildOpportunities, type Opportunity } from "@workspace/or-core/opportunities";
import type { QuestionIntent } from "@workspace/or-core/questions";
import { type AuditOptions, auditSites, type ParsedPage, type SiteAuditReport } from "@workspace/site-audit";
import { and, desc, eq, notInArray } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { brands, competitors } from "../db/schema";
import { orAuditRuns, orBrandProfiles, orOpportunities } from "../db/schema-or";
import { recordAudit } from "./audit";
import { loadAnalysedRuns, loadSubjects, type MethodReport, visibilityReport } from "./visibility-service";

const toAuditPage = (p: ParsedPage): AuditPage => ({
	url: p.url,
	title: p.title,
	metaDescription: p.metaDescription,
	text: p.text,
	headings: p.headings,
	jsonLd: p.jsonLd,
});

export interface BrandAuditOptions {
	/** Pages per site. */
	pages?: number;
	/** Only for tests against a local server. */
	allowPrivateNetwork?: boolean;
	/** Gap between requests to one host; the crawler's polite default when omitted. */
	delayMs?: number;
	/** Replaces the crawler (tests). */
	audit?: (options: AuditOptions) => Promise<SiteAuditReport>;
}

/** Crawl the client's site and its competitors' sites once, run every Online Reset audit, and store the result. */
export async function runBrandAudit(
	conn: DbConnection,
	brandId: string,
	options: BrandAuditOptions = {},
): Promise<typeof orAuditRuns.$inferSelect> {
	const audit = options.audit ?? auditSites;
	const [brand] = await conn.select().from(brands).where(eq(brands.id, brandId)).limit(1);
	if (!brand) throw new Error(`Brand not found: ${brandId}`);
	const [profile] = await conn.select().from(orBrandProfiles).where(eq(orBrandProfiles.brandId, brandId)).limit(1);
	const rivals = await conn.select().from(competitors).where(eq(competitors.brandId, brandId));
	const [run] = await conn.insert(orAuditRuns).values({ brandId }).returning();
	if (!run) throw new Error("Could not start audit run");
	const delay = options.delayMs === undefined ? {} : { delayMs: options.delayMs };
	const budget = { pages: options.pages ?? 10, requests: 75, ...delay };
	try {
		const report = await audit({
			website: brand.website,
			additionalDomains: brand.additionalDomains,
			budget,
			includeParsedPages: true,
			allowPrivateNetwork: options.allowPrivateNetwork,
		});
		const pages = report.sites.flatMap((s) => s.parsedPages ?? []).map(toAuditPage);
		const competitorPages = await crawlCompetitors(
			audit,
			rivals,
			{ pages: 5, requests: 30, ...delay },
			options.allowPrivateNetwork,
		);
		const facts = profileFacts(brand.name, profile);
		const findings = allFindings(pages, facts, competitorPages);
		const siteReport = { ...report, sites: report.sites.map(({ parsedPages: _p, ...s }) => s) };
		const [done] = await conn
			.update(orAuditRuns)
			.set({
				status: "completed",
				siteReport,
				findings,
				scores: scoreFindings(findings),
				brandCompleteness: brandCompleteness(findings),
				agentReadiness: report.score,
				pagesAudited: pages.map((p) => p.url),
				pageOutline: pages.map((p) => ({ url: p.url, title: p.title, headings: p.headings })),
				competitorPages: Object.fromEntries(Object.entries(competitorPages).map(([k, v]) => [k, v.map((p) => p.url)])),
				completedAt: new Date(),
			})
			.where(eq(orAuditRuns.id, run.id))
			.returning();
		await recordAudit(conn, {
			organizationId: brand.organizationId,
			brandId,
			actorType: "system",
			action: "audit.completed",
			subjectType: "audit_run",
			subjectId: run.id,
			details: { findings: findings.length },
		});
		return done ?? run;
	} catch (error) {
		await conn
			.update(orAuditRuns)
			.set({ status: "failed", error: String(error), completedAt: new Date() })
			.where(eq(orAuditRuns.id, run.id));
		throw error;
	}
}

function allFindings(
	pages: AuditPage[],
	facts: BrandProfileFacts,
	competitorPages: Record<string, AuditPage[]>,
): Finding[] {
	return [
		...auditBrandIdentity(pages, facts),
		...auditStructuredData(pages, facts),
		...auditContentQuality(pages),
		...auditIntentCoverage(pages, facts),
		...auditCompetitorGap(pages, competitorPages),
	];
}

async function crawlCompetitors(
	audit: (options: AuditOptions) => Promise<SiteAuditReport>,
	rivals: (typeof competitors.$inferSelect)[],
	budget: AuditOptions["budget"],
	allowPrivateNetwork: boolean | undefined,
): Promise<Record<string, AuditPage[]>> {
	const out: Record<string, AuditPage[]> = {};
	for (const rival of rivals) {
		const site = rival.domains[0];
		if (!site) continue;
		try {
			const r = await audit({
				website: site.includes("://") ? site : `https://${site}`,
				budget,
				includeParsedPages: true,
				allowPrivateNetwork,
			});
			out[rival.name] = r.sites.flatMap((s) => s.parsedPages ?? []).map(toAuditPage);
		} catch {
			// One unreachable competitor site must not fail the client's audit.
			out[rival.name] = [];
		}
	}
	return out;
}

function profileFacts(name: string, profile: typeof orBrandProfiles.$inferSelect | undefined): BrandProfileFacts {
	return {
		name,
		legalName: profile?.legalName,
		phone: profile?.phone,
		email: profile?.email,
		streetAddress: profile?.streetAddress,
		city: profile?.city,
		region: profile?.region,
		postcode: profile?.postcode,
		openingHours: profile?.openingHours,
		services: profile?.services ?? [],
		serviceAreas: profile?.serviceAreas ?? [],
		sameAs: profile?.sameAs ?? [],
	};
}

export { refreshOpportunities } from "./opportunity-service";
