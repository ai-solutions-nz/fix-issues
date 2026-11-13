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

/** Drizzle wraps a driver error in DrizzleQueryError; the guard's error is its cause. */
function closedByGuard(error: unknown): boolean {
	for (let e = error, depth = 0; e && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
		if (e instanceof TenantTransactionClosedError) return true;
	}
	return false;
}

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

	// Packet 1c: Neo's two repros. Each fires inside organization B's open
	// transaction, which may be holding the very connection A's request used.
	it("refuses the callback's tx after its transaction has committed", async () => {
		let saved: typeof db | undefined;
		await withTenant({ organizationId: ORG_A }, async (tx) => {
			saved = tx as unknown as typeof db;
		});
		const outcome = await withTenant({ organizationId: ORG_B }, async () =>
			(saved as typeof db)
				.select({ id: brands.id })
				.from(brands)
				.then(
					(rows) => ({ rows }),
					(error: unknown) => ({ error }),
				),
		);
		expect("rows" in outcome, "tenant A's tx read rows inside tenant B's transaction").toBe(false);
		expect(closedByGuard((outcome as { error: unknown }).error)).toBe(true);
		const direct = await (saved as typeof db).execute(sql`select 1`).then(
			() => null,
			(error: unknown) => error,
		);
		expect(closedByGuard(direct)).toBe(true);
	});

	it("refuses a query built inside the scope but run after it ended", async () => {
		const built: { viaDb?: PromiseLike<unknown>; viaTx?: PromiseLike<unknown>; relational?: PromiseLike<unknown> } = {};
		await withTenant({ organizationId: ORG_A }, async (tx) => {
			built.viaDb = db.select({ id: brands.id }).from(brands);
			built.viaTx = tx.select({ id: brands.id }).from(brands);
			built.relational = db.query.brands.findMany({ columns: { id: true } });
		});
		const outcomes = await withTenant({ organizationId: ORG_B }, async () =>
			Promise.all(
				[built.viaDb, built.viaTx, built.relational].map((query) =>
					Promise.resolve(query).then(
						(rows) => ({ rows }),
						(error: unknown) => ({ error }),
					),
				),
			),
		);
		for (const outcome of outcomes) {
			expect("rows" in outcome, "a query built in tenant A's scope ran later").toBe(false);
			expect(closedByGuard((outcome as { error: unknown }).error)).toBe(true);
		}
	});

	it("refuses a prepared statement made inside the scope and run after it", async () => {
		let prepared: { execute: () => Promise<unknown> } | undefined;
		await withTenant({ organizationId: ORG_A }, async (tx) => {
			prepared = tx.select({ id: brands.id }).from(brands).prepare("or_roles_prepared");
		});
		const error = await withTenant({ organizationId: ORG_B }, async () => prepared?.execute()).then(
			() => null,
			(e: unknown) => e,
		);
		expect(closedByGuard(error)).toBe(true);
	});

	// Packet 1d: Neo's race. An unawaited slow query keeps the connection busy, so
	// drizzle's COMMIT (or ROLLBACK) waits in pg's queue behind it; a timer then
	// fires a query while the end is in flight. Before the fix that query ran
	// after the COMMIT as the owner login, with no tenant scope.
	const probe = sql`select current_user::text as login,
		coalesce(current_setting('or.org_ids', true), '') as orgs,
		(select count(*)::int from brands where id in (${BRAND_A}, ${BRAND_B})) as brands`;

	async function raceTheEnd(end: "commit" | "rollback") {
		let racing: Promise<unknown> = Promise.resolve();
		const run = withTenant({ organizationId: ORG_A }, async () => {
			const slow = db.execute(sql`select pg_sleep(0.3)`);
			slow.catch(() => {});
			racing = delay(100).then(() => db.execute(probe));
			racing.catch(() => {});
			if (end === "rollback") throw new Error("simulated failure");
		});
		await run.catch(() => {});
		return racing.then(
			(result) => ({ rows: (result as { rows: unknown[] }).rows }),
			(error: unknown) => ({ error }),
		);
	}

	it("refuses a query racing the COMMIT", async () => {
		const outcome = await raceTheEnd("commit");
		expect("rows" in outcome ? outcome.rows : null, "a query ran after COMMIT").toBeNull();
		expect(closedByGuard((outcome as { error: unknown }).error)).toBe(true);
	});

	it("refuses a query racing the ROLLBACK", async () => {
		const outcome = await raceTheEnd("rollback");
		expect("rows" in outcome ? outcome.rows : null, "a query ran after ROLLBACK").toBeNull();
		expect(closedByGuard((outcome as { error: unknown }).error)).toBe(true);
	});

	it("keeps the transaction usable after a savepoint rolls back", async () => {
		const result = await withTenant({ organizationId: ORG_A }, async (tx) => {
			await tx
				.transaction(async (sp) => {
					await sp.update(brands).set({ name: "savepoint change" }).where(eq(brands.id, BRAND_A));
					throw new Error("undo the savepoint");
				})
				.catch(() => {});
			// The same through the shared handle, which nests as a savepoint too.
			await db
				.transaction(async (sp) => {
					await sp.update(brands).set({ name: "savepoint change 2" }).where(eq(brands.id, BRAND_A));
					throw new Error("undo again");
				})
				.catch(() => {});
			const rows = await db.select({ id: brands.id, name: brands.name }).from(brands);
			const [scope] = (await tx.execute(probe)).rows as Array<{ login: string; orgs: string }>;
			return { rows, scope };
		});
		expect(result.rows).toEqual([{ id: BRAND_A, name: "Roles Brand A" }]);
		expect(result.scope).toMatchObject({ login: "or_tenant", orgs: ORG_A });
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
