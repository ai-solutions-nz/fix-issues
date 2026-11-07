import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, serviceDb } from "./db";
import { insertRuns } from "./runs";
import { brands, citations, organization, promptRuns, prompts, runExtractions, runMentions } from "./schema";
import { orAuditLog, orBrandProfiles } from "./schema-or";
import { withTenant } from "./tenant";

const ORG_A = "or-iso-org-a";
const ORG_B = "or-iso-org-b";
const BRAND_A1 = "or-iso-brand-a1";
const BRAND_A2 = "or-iso-brand-a2";
const BRAND_B = "or-iso-brand-b";
const PROMPT = {
	a1: "c0000000-0000-4000-8000-0000000000a1",
	a2: "c0000000-0000-4000-8000-0000000000a2",
	b: "c0000000-0000-4000-8000-00000000000b",
};
const RUN = { a1: "d0000000-0000-4000-8000-0000000000a1", b: "d0000000-0000-4000-8000-00000000000b" };

async function cleanup() {
	const brandIds = [BRAND_A1, BRAND_A2, BRAND_B];
	await serviceDb.execute(sql`ALTER TABLE or_audit_log DISABLE TRIGGER or_audit_log_append_only`);
	await serviceDb.delete(orAuditLog).where(inArray(orAuditLog.organizationId, [ORG_A, ORG_B]));
	await serviceDb.execute(sql`ALTER TABLE or_audit_log ENABLE TRIGGER or_audit_log_append_only`);
	await serviceDb.delete(citations).where(inArray(citations.brandId, brandIds));
	await serviceDb.execute(
		sql`DELETE FROM prompt_runs WHERE brand_id IN (${sql.join(
			brandIds.map((id) => sql`${id}`),
			sql`, `,
		)})`,
	);
	await serviceDb.delete(orBrandProfiles).where(inArray(orBrandProfiles.brandId, brandIds));
	await serviceDb.delete(prompts).where(inArray(prompts.brandId, brandIds));
	await serviceDb.delete(brands).where(inArray(brands.id, brandIds));
	await serviceDb.delete(organization).where(inArray(organization.id, [ORG_A, ORG_B]));
}

beforeAll(async () => {
	await cleanup();
	await serviceDb.insert(organization).values([
		{ id: ORG_A, name: "Agency A", slug: "or-iso-agency-a", createdAt: new Date() },
		{ id: ORG_B, name: "Agency B", slug: "or-iso-agency-b", createdAt: new Date() },
	]);
	await serviceDb.insert(brands).values([
		{ id: BRAND_A1, name: "A One", website: "https://a1.example", organizationId: ORG_A },
		{ id: BRAND_A2, name: "A Two", website: "https://a2.example", organizationId: ORG_A },
		{ id: BRAND_B, name: "B One", website: "https://b.example", organizationId: ORG_B },
	]);
	await serviceDb.insert(prompts).values([
		{ id: PROMPT.a1, brandId: BRAND_A1, value: "a1 question" },
		{ id: PROMPT.a2, brandId: BRAND_A2, value: "a2 question" },
		{ id: PROMPT.b, brandId: BRAND_B, value: "b question" },
	]);
	await insertRuns(serviceDb, [
		{
			id: RUN.a1,
			promptId: PROMPT.a1,
			brandId: BRAND_A1,
			model: "fixture",
			version: "1",
			webSearchEnabled: false,
			rawOutput: { text: "a" },
			collectionMethod: "fixture",
			textContent: "a",
			mentions: { brandMentioned: true, competitorsMentioned: [], assessments: null, stamp: null },
		},
		{
			id: RUN.b,
			promptId: PROMPT.b,
			brandId: BRAND_B,
			model: "fixture",
			version: "1",
			webSearchEnabled: false,
			rawOutput: { text: "b" },
			collectionMethod: "fixture",
			textContent: "b",
			mentions: { brandMentioned: false, competitorsMentioned: [], assessments: null, stamp: null },
		},
	]);
});

afterAll(async () => {
	await cleanup();
});

/** Drizzle wraps driver errors as "Failed query: …"; the Postgres reason is on `cause`. */
async function expectDbError(work: Promise<unknown>, reason: RegExp) {
	const error = await work.then(
		() => null,
		(e: unknown) => e as Error & { cause?: Error },
	);
	expect(error, "expected the database to refuse").not.toBeNull();
	expect(error?.cause?.message ?? error?.message).toMatch(reason);
}

describe("database-enforced tenant isolation", () => {
	it("returns only the tenant's own rows, across direct and derived tables", async () => {
		await withTenant({ organizationId: ORG_A }, async (tx) => {
			const ownBrands = await tx.select({ id: brands.id }).from(brands);
			expect(ownBrands.map((b) => b.id).sort()).toEqual([BRAND_A1, BRAND_A2]);
			const ownPrompts = await tx.select({ id: prompts.id }).from(prompts);
			expect(ownPrompts.map((p) => p.id).sort()).toEqual([PROMPT.a1, PROMPT.a2]);
			expect((await tx.select({ id: promptRuns.id }).from(promptRuns)).map((r) => r.id)).toEqual([RUN.a1]);
			expect((await tx.select({ id: runExtractions.runId }).from(runExtractions)).map((r) => r.id)).toEqual([RUN.a1]);
			expect((await tx.select({ id: runMentions.runId }).from(runMentions)).map((r) => r.id)).toEqual([RUN.a1]);
			expect((await tx.select({ id: organization.id }).from(organization)).map((o) => o.id)).toEqual([ORG_A]);
		});
	});

	it("routes the shared db handle through the tenant transaction", async () => {
		const visible = await withTenant({ organizationId: ORG_B }, () => db.select({ id: brands.id }).from(brands));
		expect(visible.map((b) => b.id)).toEqual([BRAND_B]);
		const outside = await db
			.select({ id: brands.id })
			.from(brands)
			.where(inArray(brands.id, [BRAND_A1, BRAND_B]));
		expect(outside).toHaveLength(2);
	});

	it("rejects writes into another tenant's brand", async () => {
		await expectDbError(
			withTenant({ organizationId: ORG_A }, (tx) => tx.insert(prompts).values({ brandId: BRAND_B, value: "smuggled" })),
			/row-level security/,
		);
		const updated = await withTenant({ organizationId: ORG_A }, (tx) =>
			tx.update(brands).set({ name: "hijacked" }).where(eq(brands.id, BRAND_B)).returning({ id: brands.id }),
		);
		expect(updated).toEqual([]);
		const [b] = await serviceDb.select({ name: brands.name }).from(brands).where(eq(brands.id, BRAND_B));
		expect(b?.name).toBe("B One");
	});

	it("narrows client users to their own brands", async () => {
		const visible = await withTenant({ organizationId: ORG_A, brandIds: [BRAND_A2] }, (tx) =>
			tx.select({ id: prompts.id }).from(prompts),
		);
		expect(visible.map((p) => p.id)).toEqual([PROMPT.a2]);
	});

	it("denies tenant access to tables without a tenancy key", async () => {
		await expectDbError(
			withTenant({ organizationId: ORG_A }, (tx) => tx.execute(sql`select count(*) from "session"`)),
			/permission denied/,
		);
		await expectDbError(
			withTenant({ organizationId: ORG_A }, (tx) => tx.execute(sql`select count(*) from secrets`)),
			/permission denied/,
		);
	});

	it("sees nothing without a tenant set, even as the tenant role", async () => {
		const rows = await serviceDb.transaction(async (tx) => {
			await tx.execute(sql`set local role or_tenant`);
			return tx.select({ id: brands.id }).from(brands);
		});
		expect(rows).toEqual([]);
	});

	it("refuses to nest one organization's scope inside another's", async () => {
		await expect(
			withTenant({ organizationId: ORG_A }, () => withTenant({ organizationId: ORG_B }, async () => 1)),
		).rejects.toThrow(/another organization/);
	});

	it("covers every table that carries a tenancy key with a policy", async () => {
		const result = await serviceDb.execute<{ table_name: string }>(sql`
			select distinct c.table_name
			from information_schema.columns c
			join pg_class t on t.relname = c.table_name and t.relkind = 'r'
			join pg_namespace n on n.oid = t.relnamespace and n.nspname = 'public'
			where c.table_schema = 'public'
				and c.column_name in ('brand_id', 'organization_id', 'run_id', 'prompt_run_id', 'prompt_id')
				and not exists (
					select 1 from pg_policies p
					where p.schemaname = 'public' and p.tablename = c.table_name and p.policyname = 'or_tenant_isolation'
				)`);
		expect(result.rows.map((r) => r.table_name)).toEqual([]);
	});

	it("keeps the audit log append-only", async () => {
		await withTenant({ organizationId: ORG_A }, (tx) =>
			tx.insert(orAuditLog).values({
				organizationId: ORG_A,
				actorType: "system",
				action: "test",
				subjectType: "brand",
				subjectId: BRAND_A1,
			}),
		);
		await expectDbError(
			serviceDb.update(orAuditLog).set({ action: "rewritten" }).where(eq(orAuditLog.organizationId, ORG_A)),
			/append-only/,
		);
		await expectDbError(
			withTenant({ organizationId: ORG_A }, (tx) =>
				tx
					.insert(orAuditLog)
					.values({ organizationId: ORG_B, actorType: "system", action: "forged", subjectType: "brand" }),
			),
			/row-level security/,
		);
	});
});
