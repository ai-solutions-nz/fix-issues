/**
 * Online Reset (Packet 1b): the tenant transaction handle closes with its
 * transaction, ids that would corrupt the comma-separated settings are refused,
 * and migration 0040 narrows what restricted and non-admin callers may do.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, serviceDb, TenantTransactionClosedError } from "./db";
import { apikey, brands, member, organization, subscription, user } from "./schema";
import { withTenant } from "./tenant";

const ORG_A = "or-roles-org-a";
const ORG_B = "or-roles-org-b";
const BRAND_A = "or-roles-brand-a";
const BRAND_B = "or-roles-brand-b";
const USER = "or-roles-user";

async function cleanup() {
	await serviceDb.delete(apikey).where(inArray(apikey.referenceId, [ORG_A, ORG_B]));
	await serviceDb.delete(subscription).where(inArray(subscription.referenceId, [ORG_A, ORG_B]));
	await serviceDb.delete(member).where(inArray(member.organizationId, [ORG_A, ORG_B]));
	await serviceDb.delete(brands).where(inArray(brands.id, [BRAND_A, BRAND_B]));
	await serviceDb.delete(organization).where(inArray(organization.id, [ORG_A, ORG_B]));
	await serviceDb.delete(user).where(eq(user.id, USER));
}

beforeAll(async () => {
	await cleanup();
	await serviceDb.insert(organization).values([
		{ id: ORG_A, name: "Roles A", slug: "or-roles-a", createdAt: new Date() },
		{ id: ORG_B, name: "Roles B", slug: "or-roles-b", createdAt: new Date() },
	]);
	await serviceDb.insert(user).values({ id: USER, name: "Roles User", email: "roles@tenant-a.example" });
	await serviceDb
		.insert(member)
		.values({ id: "or-roles-m1", organizationId: ORG_A, userId: USER, role: "admin", createdAt: new Date() });
	await serviceDb.insert(brands).values([
		{ id: BRAND_A, name: "Roles Brand A", website: "https://roles-a.example", organizationId: ORG_A },
		{ id: BRAND_B, name: "Roles Brand B", website: "https://roles-b.example", organizationId: ORG_B },
	]);
	const now = new Date();
	await serviceDb
		.insert(apikey)
		.values({ id: "or-roles-key", referenceId: ORG_A, key: "hashed", createdAt: now, updatedAt: now });
	await serviceDb
		.insert(subscription)
		.values({ id: "or-roles-sub", plan: "simulated", referenceId: ORG_A, status: "active" });
});

afterAll(cleanup);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("the tenant handle closes with its transaction", () => {
	it("throws for a query that outlives its request's transaction", async () => {
		let stray: Promise<unknown> = Promise.resolve();
		await withTenant({ organizationId: ORG_A }, async () => {
			// Scheduled inside the request, run after it has ended.
			stray = delay(30).then(() => db.select({ id: brands.id }).from(brands));
			stray.catch(() => {});
		});
		await expect(stray).rejects.toBeInstanceOf(TenantTransactionClosedError);
	});

	it("never lets organization A's stray query read inside organization B's transaction", async () => {
		let stray: Promise<unknown> = Promise.resolve();
		await withTenant({ organizationId: ORG_A }, async () => {
			stray = delay(30).then(() => db.select({ id: brands.id }).from(brands));
			stray.catch(() => {});
		});
		const seenByB = await withTenant({ organizationId: ORG_B }, async () => {
			// B's transaction is open (and may hold the very connection A used) while A's stray query fires.
			const outcome = await stray.then(
				(rows) => ({ rows }),
				(error: unknown) => ({ error }),
			);
			return { outcome, own: await db.select({ id: brands.id }).from(brands) };
		});
		expect(seenByB.outcome).toEqual({ error: expect.any(TenantTransactionClosedError) });
		expect(seenByB.own.map((b) => b.id)).toEqual([BRAND_B]);
	});

	it("refuses to open a nested scope from a closed one", async () => {
		let nested: Promise<unknown> = Promise.resolve();
		await withTenant({ organizationId: ORG_A }, async () => {
			nested = delay(30).then(() => withTenant({ organizationId: ORG_A }, async () => "ran"));
			nested.catch(() => {});
		});
		await expect(nested).rejects.toBeInstanceOf(TenantTransactionClosedError);
	});
});

describe("tenant ids are one plain token", () => {
	it.each([
		["organization", { organizationId: `${ORG_A},${ORG_B}` }],
		["organization list", { organizationIds: [ORG_A, `x,${ORG_B}`] }],
		["brand", { organizationId: ORG_A, brandIds: [`${BRAND_A},${BRAND_B}`] }],
		["restricted organization", { organizationId: ORG_A, restrictedOrganizationIds: ["a,b"] }],
		["admin organization", { organizationId: ORG_A, adminOrganizationIds: ["a b"] }],
	])("rejects a %s id with a separator in it", async (_what, scope) => {
		await expect(withTenant(scope, async () => "ran")).rejects.toThrow(/Invalid .* format/);
	});
});

describe("migration 0040: narrower grants", () => {
	it("hides API keys and the subscription from a restricted caller, not from an agency member", async () => {
		const agency = await withTenant({ organizationId: ORG_A }, async (tx) => ({
			keys: await tx.select({ id: apikey.id }).from(apikey),
			subs: await tx.select({ id: subscription.id }).from(subscription),
		}));
		expect(agency.keys.map((k) => k.id)).toEqual(["or-roles-key"]);
		expect(agency.subs.map((s) => s.id)).toEqual(["or-roles-sub"]);

		const client = await withTenant(
			{ organizationId: ORG_A, brandIds: [BRAND_A], restrictedOrganizationIds: [ORG_A] },
			async (tx) => ({
				keys: await tx.select({ id: apikey.id }).from(apikey),
				subs: await tx.select({ id: subscription.id }).from(subscription),
			}),
		);
		expect(client).toEqual({ keys: [], subs: [] });
	});

	it.each([
		[
			"insert an API key",
			(tx: typeof db) =>
				tx
					.insert(apikey)
					.values({ id: "or-roles-k2", referenceId: ORG_A, key: "x", createdAt: new Date(), updatedAt: new Date() }),
		],
		[
			"update an API key",
			(tx: typeof db) => tx.update(apikey).set({ name: "renamed" }).where(eq(apikey.referenceId, ORG_A)),
		],
		["delete an API key", (tx: typeof db) => tx.delete(apikey).where(eq(apikey.referenceId, ORG_A))],
		[
			"update the subscription",
			(tx: typeof db) => tx.update(subscription).set({ plan: "free" }).where(eq(subscription.referenceId, ORG_A)),
		],
		["delete the subscription", (tx: typeof db) => tx.delete(subscription).where(eq(subscription.referenceId, ORG_A))],
		[
			"add a member",
			(tx: typeof db) =>
				tx
					.insert(member)
					.values({ id: "or-roles-m2", organizationId: ORG_A, userId: USER, role: "owner", createdAt: new Date() }),
		],
		[
			"change a member's role",
			(tx: typeof db) => tx.update(member).set({ role: "owner" }).where(eq(member.organizationId, ORG_A)),
		],
		["remove a member", (tx: typeof db) => tx.delete(member).where(eq(member.organizationId, ORG_A))],
	])("refuses a tenant (even an admin of the organization) to %s", async (_what, write) => {
		await expect(
			withTenant({ organizationId: ORG_A, adminOrganizationIds: [ORG_A] }, (tx) => write(tx as unknown as typeof db)),
		).rejects.toMatchObject({ cause: { code: "42501" } });
	});

	it("lets an organization admin rename their organization, and only its name and slug", async () => {
		const renamed = await withTenant({ organizationId: ORG_A, adminOrganizationIds: [ORG_A] }, (tx) =>
			tx
				.update(organization)
				.set({ name: "Roles A renamed" })
				.where(eq(organization.id, ORG_A))
				.returning({ id: organization.id }),
		);
		expect(renamed).toEqual([{ id: ORG_A }]);
		await expect(
			withTenant({ organizationId: ORG_A, adminOrganizationIds: [ORG_A] }, (tx) =>
				tx.update(organization).set({ stripeCustomerId: "cus_simulated" }).where(eq(organization.id, ORG_A)),
			),
		).rejects.toMatchObject({ cause: { code: "42501" } });
	});

	it("does not let a non-admin member, or an admin of another organization, rename it", async () => {
		const asMember = await withTenant({ organizationId: ORG_A }, (tx) =>
			tx
				.update(organization)
				.set({ name: "hijacked" })
				.where(eq(organization.id, ORG_A))
				.returning({ id: organization.id }),
		);
		expect(asMember).toEqual([]);
		const asOtherAdmin = await withTenant({ organizationId: ORG_B, adminOrganizationIds: [ORG_B] }, (tx) =>
			tx
				.update(organization)
				.set({ name: "hijacked" })
				.where(eq(organization.id, ORG_A))
				.returning({ id: organization.id }),
		);
		expect(asOtherAdmin).toEqual([]);
		const [row] = await serviceDb
			.select({ name: organization.name })
			.from(organization)
			.where(eq(organization.id, ORG_A));
		expect(row?.name).toBe("Roles A renamed");
	});

	it("keeps every table with a tenant policy covered after 0040 re-applied the policies", async () => {
		const missing = await serviceDb.execute(sql`
			select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and c.relkind = 'r' and or_tenant_policy_expr(c.relname) is not null
				and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.policyname = 'or_tenant_isolation')`);
		expect(missing.rows).toEqual([]);
	});
});
