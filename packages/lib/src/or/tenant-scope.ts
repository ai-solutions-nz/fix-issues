import { and, eq, inArray } from "drizzle-orm";
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

/**
 * The tenant scope of a signed-in person, wherever they arrive from (web pages,
 * MCP over OAuth): every organization they belong to; in an organization where
 * they hold the `client` role, only the brands granted to them, and no access
 * to its API keys or subscription. Null (system scope) only for an instance
 * administrator.
 */
export async function userTenantScope(user: { id: string; role?: string | null }): Promise<TenantScope | null> {
	if (user.role === "admin") return null;
	const memberships = await serviceDb
		.select({ organizationId: member.organizationId, role: member.role })
		.from(member)
		.where(eq(member.userId, user.id));
	const organizationIds = memberships.map((m) => m.organizationId);
	const adminOrganizationIds = memberships
		.filter((m) => m.role === "owner" || m.role === "admin")
		.map((m) => m.organizationId);
	const clientOrgs = memberships.filter((m) => m.role === "client").map((m) => m.organizationId);
	const base = { organizationIds, adminOrganizationIds, userId: user.id };
	if (clientOrgs.length === 0) return base;
	const agencyOrgs = organizationIds.filter((id) => !clientOrgs.includes(id));
	const agencyBrands = agencyOrgs.length
		? await serviceDb.select({ id: brands.id }).from(brands).where(inArray(brands.organizationId, agencyOrgs))
		: [];
	const granted = await serviceDb
		.select({ id: orMemberBrandAccess.brandId })
		.from(orMemberBrandAccess)
		.where(and(eq(orMemberBrandAccess.userId, user.id), inArray(orMemberBrandAccess.organizationId, clientOrgs)));
	return { ...base, brandIds: [...agencyBrands, ...granted].map((b) => b.id), restrictedOrganizationIds: clientOrgs };
}
