import { sql } from "drizzle-orm";
import { serviceDb, tenantContext } from "./db";

export interface TenantScope {
	/** One organization. Use `organizationIds` for a caller who belongs to several. */
	organizationId?: string;
	/** Every organization the caller may see; combined with `organizationId`. */
	organizationIds?: string[];
	/** Restrict to these brands (client users, scoped API keys). Omit to see every brand in the organizations. */
	brandIds?: string[];
	/** The signed-in user, so their own `user` row stays readable. */
	userId?: string;
}

type Tx = Parameters<Parameters<typeof serviceDb.transaction>[0]>[0];

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
 * Postgres row-level security (migrations 0034 and 0039) filters every read and
 * rejects every cross-tenant write. An empty organization list sees nothing.
 * A nested call whose scope lies within the open one reuses its transaction;
 * any other nested call is refused.
 */
export async function withTenant<T>(scope: TenantScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
	const organizationIds = scopeOrganizations(scope);
	const current = tenantContext.getStore();
	if (current) {
		if (!within(scope, current)) throw new Error("withTenant: already inside another organization's scope");
		return fn(current.tx);
	}
	return serviceDb.transaction(async (tx) => {
		await tx.execute(sql`set local role or_tenant`);
		await tx.execute(
			sql`select set_config('or.org_ids', ${organizationIds.join(",")}, true),
				set_config('or.org_id', ${organizationIds[0] ?? ""}, true),
				set_config('or.brand_ids', ${brandSetting(scope.brandIds)}, true),
				set_config('or.user_id', ${scope.userId ?? ""}, true)`,
		);
		return tenantContext.run(
			{ tx, organizationId: organizationIds[0] ?? "", organizationIds, brandIds: scope.brandIds },
			() => fn(tx),
		);
	});
}

/**
 * `withTenant` when there is a scope; `fn` directly (system scope) when there is
 * none, which only an instance administrator or an unauthenticated request gets.
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
