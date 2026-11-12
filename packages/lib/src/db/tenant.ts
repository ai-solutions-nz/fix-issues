import { sql } from "drizzle-orm";
import { serviceDb, TenantTransactionClosedError, tenantContext } from "./db";

export interface TenantScope {
	/** One organization. Use `organizationIds` for a caller who belongs to several. */
	organizationId?: string;
	/** Every organization the caller may see; combined with `organizationId`. */
	organizationIds?: string[];
	/** Restrict to these brands (client users, scoped API keys). Omit to see every brand in the organizations. */
	brandIds?: string[];
	/**
	 * Organizations where the caller is restricted (client role, brand-scoped API
	 * key): no access to that organization's API keys or subscription.
	 */
	restrictedOrganizationIds?: string[];
	/** Organizations the caller administers (owner or admin role): may rename them. */
	adminOrganizationIds?: string[];
	/** The signed-in user, so their own `user` row stays readable. */
	userId?: string;
}

type Tx = Parameters<Parameters<typeof serviceDb.transaction>[0]>[0];

type PooledClient = { query: (...args: unknown[]) => unknown; release: (...args: unknown[]) => unknown };

/**
 * Online Reset (Packet 1c): every query of a tenant transaction, whether made
 * through the shared `db` handle, the `tx` passed to the callback, or a query
 * built inside the scope and run later, goes through the transaction's pooled
 * connection. That connection is replaced by a guard which refuses queries
 * once drizzle releases it to the pool (after COMMIT or ROLLBACK), so nothing
 * can run on it after it may have started serving another tenant.
 */
function guardTransactionConnection(tx: Tx, state: { closed: boolean }): void {
	const session = (tx as unknown as { session?: { client?: PooledClient } }).session;
	const client = session?.client;
	if (!session || !client || typeof client.query !== "function" || typeof client.release !== "function") {
		throw new Error("withTenant: cannot guard the transaction connection (unexpected driver session shape)");
	}
	session.client = new Proxy(client, {
		get(target, property) {
			if (property === "query") {
				return (...args: unknown[]) =>
					state.closed ? Promise.reject(new TenantTransactionClosedError()) : target.query(...args);
			}
			if (property === "release") {
				return (...args: unknown[]) => {
					state.closed = true;
					return target.release(...args);
				};
			}
			const value = Reflect.get(target, property, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

/** Ids are passed to Postgres as comma-separated settings, so an id must be one plain token. */
export const TENANT_ID_FORMAT = /^[A-Za-z0-9_-]{1,128}$/;

export function assertTenantId(id: string, what = "id"): void {
	if (!TENANT_ID_FORMAT.test(id)) throw new Error(`Invalid ${what} format`);
}

export function scopeOrganizations(scope: TenantScope): string[] {
	return [...new Set([...(scope.organizationId ? [scope.organizationId] : []), ...(scope.organizationIds ?? [])])];
}

/** True when everything `inner` can see is already visible under `outer`. */
function within(inner: TenantScope, outer: { organizationIds: string[]; brandIds?: string[] }): boolean {
	const orgsInside = scopeOrganizations(inner).every((id) => outer.organizationIds.includes(id));
	if (!outer.brandIds) return orgsInside;
	return orgsInside && !!inner.brandIds && inner.brandIds.every((id) => outer.brandIds?.includes(id));
}

/** An empty restriction must match no brand; an empty setting would mean "no restriction". */
const NO_BRAND = "__none__";
const brandSetting = (brandIds?: string[]) =>
	brandIds === undefined ? "" : brandIds.length ? brandIds.join(",") : NO_BRAND;

/**
 * Runs `fn` in a transaction as the `or_tenant` role with the tenant set, so
 * Postgres row-level security (migrations 0034, 0039, 0040) filters every read
 * and rejects every cross-tenant write. An empty organization list sees nothing.
 * A nested call whose scope lies within the open one reuses its transaction;
 * any other nested call is refused. When the transaction ends, the shared `db`
 * handle stops resolving to it for any work still running in its context.
 */
export async function withTenant<T>(scope: TenantScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
	const organizationIds = scopeOrganizations(scope);
	for (const id of organizationIds) assertTenantId(id, "organization id");
	for (const id of scope.brandIds ?? []) assertTenantId(id, "brand id");
	for (const id of [...(scope.restrictedOrganizationIds ?? []), ...(scope.adminOrganizationIds ?? [])]) {
		assertTenantId(id, "organization id");
	}
	const current = tenantContext.getStore();
	if (current) {
		if (current.closed) throw new TenantTransactionClosedError();
		if (!within(scope, current)) throw new Error("withTenant: already inside another organization's scope");
		return fn(current.tx);
	}
	const store = {
		tx: undefined as unknown as Tx,
		organizationId: organizationIds[0] ?? "",
		organizationIds,
		brandIds: scope.brandIds,
		closed: false,
	};
	try {
		return await serviceDb.transaction(async (tx) => {
			store.tx = tx;
			guardTransactionConnection(tx, store);
			await tx.execute(sql`set local role or_tenant`);
			await tx.execute(
				sql`select set_config('or.org_ids', ${organizationIds.join(",")}, true),
					set_config('or.org_id', ${organizationIds[0] ?? ""}, true),
					set_config('or.brand_ids', ${brandSetting(scope.brandIds)}, true),
					set_config('or.restricted_org_ids', ${(scope.restrictedOrganizationIds ?? []).join(",")}, true),
					set_config('or.admin_org_ids', ${(scope.adminOrganizationIds ?? []).join(",")}, true),
					set_config('or.user_id', ${scope.userId ?? ""}, true)`,
			);
			return tenantContext.run(store, () => fn(tx));
		});
	} finally {
		// Also set by the guarded connection's release; this covers a failed BEGIN.
		store.closed = true;
	}
}

/**
 * `withTenant` when there is a scope; `fn` directly (system scope) when there is
 * none, which only an instance administrator gets (and the worker, which does not use it).
 */
export function withTenantOrSystem<T>(scope: TenantScope | null, fn: () => Promise<T>): Promise<T> {
	return scope ? withTenant(scope, () => fn()) : fn();
}

export function currentTenant(): string | undefined {
	return tenantContext.getStore()?.organizationId;
}

/** The organizations the current request is scoped to, or null at system scope. */
export function currentTenantOrganizations(): string[] | null {
	return tenantContext.getStore()?.organizationIds ?? null;
}
