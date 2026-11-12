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
	return serviceDb.transaction(async (tx) => {
		await tx.execute(sql`set local role or_tenant`);
		await tx.execute(
			sql`select set_config('or.org_ids', ${organizationIds.join(",")}, true),
				set_config('or.org_id', ${organizationIds[0] ?? ""}, true),
				set_config('or.brand_ids', ${brandSetting(scope.brandIds)}, true),
				set_config('or.restricted_org_ids', ${(scope.restrictedOrganizationIds ?? []).join(",")}, true),
				set_config('or.admin_org_ids', ${(scope.adminOrganizationIds ?? []).join(",")}, true),
				set_config('or.user_id', ${scope.userId ?? ""}, true)`,
		);
		const store = {
			tx,
			organizationId: organizationIds[0] ?? "",
			organizationIds,
			brandIds: scope.brandIds,
			closed: false,
		};
		try {
			return await tenantContext.run(store, () => fn(tx));
		} finally {
			store.closed = true;
		}
	});
}

/**
 * `withTenant` when there is a scope; `fn` directly (system scope) when there is
 * none, which only an instance administrator or an allowlisted request gets.
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
