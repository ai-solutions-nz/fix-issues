import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serviceDb } from "../db/db";
import { insertRuns } from "../db/runs";
import { brands, citations, competitors, organization, promptRuns, prompts } from "../db/schema";
import { orPromptMeta } from "../db/schema-or";
import { withTenant } from "../db/tenant";
import { seedBuyerQuestions, visibilityReport } from "./visibility-service";

const ORG = "or-vis-org";
const BRAND = "or-vis-brand";
const ctx = {
	brand: "Kōwhai Plumbing",
	brandDomain: "kowhaiplumbing.example.nz",
	trade: "plumber",
	services: ["Hot water cylinder replacement"],
	city: "Christchurch",
	competitors: ["Southern Pipes"],
};

async function cleanup() {
	await serviceDb.delete(citations).where(eq(citations.brandId, BRAND));
	await serviceDb.execute(sql`DELETE FROM prompt_runs WHERE brand_id = ${BRAND}`);
	await serviceDb.delete(orPromptMeta).where(eq(orPromptMeta.brandId, BRAND));
	await serviceDb.delete(prompts).where(eq(prompts.brandId, BRAND));
	await serviceDb.delete(competitors).where(eq(competitors.brandId, BRAND));
	await serviceDb.delete(brands).where(eq(brands.id, BRAND));
	await serviceDb.delete(organization).where(eq(organization.id, ORG));
}

beforeAll(async () => {
	await cleanup();
	await serviceDb
		.insert(organization)
		.values({ id: ORG, name: "Vis Agency", slug: "or-vis-agency", createdAt: new Date() });
	await serviceDb
		.insert(brands)
		.values({ id: BRAND, name: "Kōwhai Plumbing", website: "https://kowhaiplumbing.example.nz", organizationId: ORG });
	await serviceDb
		.insert(competitors)
		.values({ brandId: BRAND, name: "Southern Pipes", domains: ["southernpipes.example.nz"] });
});

afterAll(cleanup);

describe("visibility service", () => {
	it("seeds validated, de-duplicated buyer questions under tenant isolation", async () => {
		const result = await withTenant({ organizationId: ORG }, (tx) => seedBuyerQuestions(tx, BRAND, ctx));
		expect(result.created).toBeGreaterThan(10);
		const meta = await serviceDb.select().from(orPromptMeta).where(eq(orPromptMeta.brandId, BRAND));
		expect(meta).toHaveLength(result.created);
		expect(meta.every((m) => m.embedding?.length === 256 && m.source === "template")).toBe(true);
		const again = await withTenant({ organizationId: ORG }, (tx) => seedBuyerQuestions(tx, BRAND, ctx));
		expect(again.created).toBe(0);
	});

	it("reports each collection method separately, recomputed from stored evidence", async () => {
		const ps = await serviceDb.select().from(prompts).where(eq(prompts.brandId, BRAND));
		const discovery = ps.find((p) => p.value === "Who is the best plumber in Christchurch?");
		const brandQ = ps.find((p) => p.value.startsWith("Is Kōwhai Plumbing"));
		expect(discovery && brandQ).toBeTruthy();
		const base = { brandId: BRAND, version: "1", webSearchEnabled: true, rawOutput: {} };
		const saved = await insertRuns(serviceDb, [
			{
				...base,
				promptId: discovery!.id,
				model: "chatgpt",
				provider: "fixture",
				collectionMethod: "fixture",
				textContent: "1. Southern Pipes\n2. Kōwhai Plumbing",
			},
			{
				...base,
				promptId: discovery!.id,
				model: "claude",
				provider: "fixture",
				collectionMethod: "fixture",
				textContent: "I recommend Southern Pipes.",
			},
			{
				...base,
				promptId: brandQ!.id,
				model: "chatgpt",
				provider: "fixture",
				collectionMethod: "fixture",
				textContent: "Kōwhai Plumbing is reliable.",
			},
			{
				...base,
				promptId: discovery!.id,
				model: "gpt-5",
				provider: "openai-api",
				collectionMethod: "model_api_grounded",
				textContent: "Kōwhai Plumbing is well reviewed.",
			},
		]);
		await serviceDb.insert(citations).values({
			promptRunId: saved[1]!.id,
			promptId: discovery!.id,
			brandId: BRAND,
			model: "claude",
			url: "https://nocowboys.example/plumbers",
			domain: "nocowboys.example",
			citationIndex: 0,
			createdAt: new Date(),
		});

		const reports = await withTenant({ organizationId: ORG }, (tx) => visibilityReport(tx, BRAND));
		expect(reports.map((r) => r.method).sort()).toEqual(["fixture", "model_api_grounded"]);
		const fixture = reports.find((r) => r.method === "fixture")!;
		expect(fixture.overall.simulated).toBe(true);
		expect(fixture.overall.n).toBe(2);
		expect(fixture.overall.excludedBranded).toBe(1);
		expect(fixture.overall.visibility).toBe(50);
		expect(fixture.overall.averageListPosition).toBe(2);
		expect(Object.keys(fixture.byEngine)).toEqual(["chatgpt", "claude"]);
		expect(fixture.sources).toEqual([{ domain: "nocowboys.example", citations: 1, answers: 1 }]);
		expect(fixture.questions.find((q) => q.promptId === discovery!.id)?.recommendedCompetitors).toEqual([
			"Southern Pipes",
		]);
		const live = reports.find((r) => r.method === "model_api_grounded")!;
		expect(live.overall.simulated).toBe(false);
		expect(live.overall.visibility).toBe(100);
		expect(fixture.overall.runIds).not.toContain(saved[3]!.id);
	});

	it("cannot read another tenant's brand", async () => {
		await serviceDb
			.insert(organization)
			.values({ id: "or-vis-other", name: "Other", slug: "or-vis-other", createdAt: new Date() })
			.onConflictDoNothing();
		await expect(withTenant({ organizationId: "or-vis-other" }, (tx) => visibilityReport(tx, BRAND))).rejects.toThrow(
			/Brand not found/,
		);
		await serviceDb.delete(organization).where(inArray(organization.id, ["or-vis-other"]));
	});
});
