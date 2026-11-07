import { and, eq } from "drizzle-orm";
import { serviceDb } from "../db/db";
import { brands, member } from "../db/schema";
import { orMemberBrandAccess } from "../db/schema-or";
import type { TenantScope } from "../db/tenant";

export interface ResolvedTenant extends TenantScope {
	role: string;
}

/**
 * The scope a user may act in for a brand. Agency roles get the whole
 * organization; the `client` role gets only the brands granted to them. A
 * missing brand and a forbidden one are the same error.
 */
export async function resolveTenantScope(userId: string, brandId: string): Promise<ResolvedTenant> {
	const [row] = await serviceDb
		.select({ organizationId: brands.organizationId, role: member.role })
		.from(brands)
		.innerJoin(member, and(eq(member.organizationId, brands.organizationId), eq(member.userId, userId)))
		.where(eq(brands.id, brandId))
		.limit(1);
	if (!row) throw new Error("Forbidden: No access to this brand");
	if (row.role !== "client") return { organizationId: row.organizationId, role: row.role };
	const grants = await serviceDb
		.select({ brandId: orMemberBrandAccess.brandId })
		.from(orMemberBrandAccess)
		.where(and(eq(orMemberBrandAccess.organizationId, row.organizationId), eq(orMemberBrandAccess.userId, userId)));
	const brandIds = grants.map((g) => g.brandId);
	if (!brandIds.includes(brandId)) throw new Error("Forbidden: No access to this brand");
	return { organizationId: row.organizationId, role: row.role, brandIds };
}
