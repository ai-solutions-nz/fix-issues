import type { Finding } from "@workspace/or-core/audits";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serviceDb } from "../db/db";
import { insertRuns } from "../db/runs";
import { brands, citations, competitors, organization, prompts } from "../db/schema";
import { orAuditLog, orAuditRuns, orBrandProfiles, orOpportunities, orPromptMeta } from "../db/schema-or";
import { withTenant } from "../db/tenant";
import { refreshOpportunities, runBrandAudit } from "./audit-service";
import { DEMO_BUSINESS, DEMO_COMPETITORS, demoClientSite, demoCompetitorSite } from "./demo/christchurch";
import { serveSites } from "./demo/sites-server";

const ORG = "or-audit-org";
const BRAND = "or-audit-brand";
let close: () => Promise<void>;

async function cleanup() {
	await serviceDb.execute(sql`ALTER TABLE or_audit_log DISABLE TRIGGER or_audit_log_append_only`);
	await serviceDb.delete(orAuditLog).where(eq(orAuditLog.organizationId, ORG));
	await serviceDb.execute(sql`ALTER TABLE or_audit_log ENABLE TRIGGER or_audit_log_append_only`);
	await serviceDb.delete(orOpportunities).where(eq(orOpportunities.brandId, BRAND));
	await serviceDb.delete(orAuditRuns).where(eq(orAuditRuns.brandId, BRAND));
	await serviceDb.delete(citations).where(eq(citations.brandId, BRAND));
	await serviceDb.execute(sql`DELETE FROM prompt_runs WHERE brand_id = ${BRAND}`);
	await serviceDb.delete(orPromptMeta).where(eq(orPromptMeta.brandId, BRAND));
	await serviceDb.delete(prompts).where(eq(prompts.brandId, BRAND));
	await serviceDb.delete(competitors).where(eq(competitors.brandId, BRAND));
	await serviceDb.delete(orBrandProfiles).where(eq(orBrandProfiles.brandId, BRAND));
	await serviceDb.delete(brands).where(eq(brands.id, BRAND));
	await serviceDb.delete(organization).where(eq(organization.id, ORG));
}

beforeAll(async () => {
	await cleanup();
	const served = await serveSites({
		client: demoClientSite(),
		c0: demoCompetitorSite(0),
		c1: demoCompetitorSite(1),
		c2: demoCompetitorSite(2),
	});
	close = served.close;
	await serviceDb
		.insert(organization)
		.values({ id: ORG, name: "Audit Agency", slug: "or-audit-agency", createdAt: new Date() });
	await serviceDb.insert(brands).values({
		id: BRAND,
		name: DEMO_BUSINESS.name,
		aliases: [...DEMO_BUSINESS.aliases],
		website: served.origins.client as string,
		organizationId: ORG,
	});
	await serviceDb.insert(orBrandProfiles).values({
		brandId: BRAND,
		phone: DEMO_BUSINESS.phone,
		streetAddress: DEMO_BUSINESS.streetAddress,
		city: DEMO_BUSINESS.city,
		region: DEMO_BUSINESS.region,
		openingHours: DEMO_BUSINESS.openingHours,
		services: [...DEMO_BUSINESS.services],
		serviceAreas: [...DEMO_BUSINESS.serviceAreas],
	});
	await serviceDb
		.insert(competitors)
		.values(
			DEMO_COMPETITORS.map((c, i) => ({ brandId: BRAND, name: c.name, domains: [served.origins[`c${i}`] as string] })),
		);
}, 30_000);

afterAll(async () => {
	await close?.();
	await cleanup();
});

describe("brand audit (real crawl of local fictional sites)", () => {
	it("crawls the client and competitors and records evidence-backed findings", async () => {
		const run = await withTenant({ organizationId: ORG }, (tx) =>
			runBrandAudit(tx, BRAND, { allowPrivateNetwork: true, delayMs: 0 }),
		);
		expect(run.status).toBe("completed");
		expect(run.pagesAudited.length).toBeGreaterThanOrEqual(4);
		const f = Object.fromEntries((run.findings as Finding[]).map((x) => [x.id, x]));
		expect(f["brand.name_on_site"]?.status).toBe("pass");
		expect(f["brand.phone_on_site"]?.status).toBe("pass");
		expect(f["brand.phone_consistency"]?.status).toBe("warn");
		expect(f["schema.local_business"]?.status).toBe("pass");
		expect(f["schema.recommended_properties"]?.evidence).toContain("areaServed");
		expect(f["intent.service:blocked drains"]?.status).toBe("pass");
		expect(f["intent.service:hot water cylinder replacement"]?.status).toBe("fail");
		expect((run.findings as Finding[]).some((x) => x.id === "gap.topic:heat pump water heaters")).toBe(true);
		expect(run.agentReadiness).not.toBeNull();
		expect(run.brandCompleteness).toBeGreaterThan(0);
		const log = await serviceDb
			.select()
			.from(orAuditLog)
			.where(and(eq(orAuditLog.organizationId, ORG), eq(orAuditLog.action, "audit.completed")));
		expect(log).toHaveLength(1);
	}, 60_000);

	it("builds prioritised opportunities and keeps a human's decision across refreshes", async () => {
		const [p] = await serviceDb
			.insert(prompts)
			.values({ brandId: BRAND, value: "Who does hot water cylinder replacement in Christchurch?" })
			.returning();
		await serviceDb
			.insert(orPromptMeta)
			.values({ promptId: p!.id, brandId: BRAND, intent: "service", source: "template" });
		const saved = await insertRuns(serviceDb, [
			{
				promptId: p!.id,
				brandId: BRAND,
				model: "chatgpt",
				provider: "fixture",
				version: "1",
				webSearchEnabled: true,
				rawOutput: {},
				collectionMethod: "fixture",
				textContent: "1. Southern Pipes Plumbing",
			},
		]);
		await serviceDb.insert(citations).values({
			promptRunId: saved[0]!.id,
			promptId: p!.id,
			brandId: BRAND,
			model: "chatgpt",
			url: "https://trade-reviews.example/chch",
			domain: "trade-reviews.example",
			citationIndex: 0,
			createdAt: new Date(),
		});

		const ops = await withTenant({ organizationId: ORG }, (tx) => refreshOpportunities(tx, BRAND));
		expect(ops.map((o) => o.type)).toEqual(
			expect.arrayContaining(["ai_answer_gap", "citation_source", "technical_fix", "content_gap"]),
		);
		const gap = ops.find((o) => o.type === "ai_answer_gap");
		expect(gap?.evidence.runIds).toEqual([saved[0]!.id]);
		expect(gap?.rationale).toContain("Southern Pipes Plumbing");

		await serviceDb
			.update(orOpportunities)
			.set({ status: "dismissed" })
			.where(and(eq(orOpportunities.brandId, BRAND), eq(orOpportunities.opportunityId, gap!.id)));
		await withTenant({ organizationId: ORG }, (tx) => refreshOpportunities(tx, BRAND));
		const [row] = await serviceDb
			.select()
			.from(orOpportunities)
			.where(and(eq(orOpportunities.brandId, BRAND), eq(orOpportunities.opportunityId, gap!.id)));
		expect(row?.status).toBe("dismissed");
		expect(row?.collectionMethod).toBe("fixture");
	});
});
