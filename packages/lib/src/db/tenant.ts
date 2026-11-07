import { sql } from "drizzle-orm";
import { serviceDb, tenantContext } from "./db";

export interface TenantScope {
	organizationId: string;
	/** Restrict to these brands (client users). Omit for agency staff, who see every brand in the organization. */
	brandIds?: string[];
}

type Tx = Parameters<Parameters<typeof serviceDb.transaction>[0]>[0];

/**
 * Runs `fn` in a transaction as the `or_tenant` role with the tenant set, so
 * Postgres row-level security (migration 0034) filters every read and rejects
 * every cross-tenant write. Nested calls for the same organization reuse the
 * open transaction; a nested call for another organization is refused.
 */
export async function withTenant<T>(scope: TenantScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
	if (!scope.organizationId) throw new Error("withTenant: organizationId is required");
	const current = tenantContext.getStore();
	if (current) {
		if (current.organizationId !== scope.organizationId) {
			throw new Error("withTenant: already inside another organization's scope");
		}
		return fn(current.tx);
	}
	return serviceDb.transaction(async (tx) => {
		await tx.execute(sql`set local role or_tenant`);
		await tx.execute(
			sql`select set_config('or.org_id', ${scope.organizationId}, true), set_config('or.brand_ids', ${(scope.brandIds ?? []).join(",")}, true)`,
		);
		return tenantContext.run({ tx, organizationId: scope.organizationId }, () => fn(tx));
	});
}

export function currentTenant(): string | undefined {
	return tenantContext.getStore()?.organizationId;
}
