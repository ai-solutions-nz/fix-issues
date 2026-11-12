/**
 * Online Reset: the database tenant scope for each kind of caller. Every web
 * entry point (server functions, /api/v1, MCP tools) runs inside it, so
 * Postgres row-level security bounds what the request can read or write even
 * if an application-level check were missed.
 */
import { serviceDb } from "@workspace/lib/db/db";
import { brands, member } from "@workspace/lib/db/schema";
import { orMemberBrandAccess } from "@workspace/lib/db/schema-or";
import type { TenantScope } from "@workspace/lib/db/tenant";
import { and, eq, inArray } from "drizzle-orm";
import { type Principal, principalReach } from "@/lib/auth/api-auth";

/**
 * A signed-in user sees the organizations they belong to; in an organization
 * where they hold the `client` role, only the brands granted to them. Null
 * (system scope) for an instance administrator only.
 */
export async function tenantScopeForUser(user: { id: string; role?: string | null }): Promise<TenantScope | null> {
	if (user.role === "admin") return null;
	const memberships = await serviceDb
		.select({ organizationId: member.organizationId, role: member.role })
		.from(member)
		.where(eq(member.userId, user.id));
	const organizationIds = memberships.map((m) => m.organizationId);
	const clientOrgs = memberships.filter((m) => m.role === "client").map((m) => m.organizationId);
	if (clientOrgs.length === 0) return { organizationIds, userId: user.id };
	const agencyOrgs = organizationIds.filter((id) => !clientOrgs.includes(id));
	const agencyBrands = agencyOrgs.length
		? await serviceDb.select({ id: brands.id }).from(brands).where(inArray(brands.organizationId, agencyOrgs))
		: [];
	const granted = await serviceDb
		.select({ id: orMemberBrandAccess.brandId })
		.from(orMemberBrandAccess)
		.where(and(eq(orMemberBrandAccess.userId, user.id), inArray(orMemberBrandAccess.organizationId, clientOrgs)));
	return { organizationIds, brandIds: [...agencyBrands, ...granted].map((b) => b.id), userId: user.id };
}

/** An API key or MCP connection sees exactly its reach; an instance admin key gets system scope. */
export function tenantScopeForPrincipal(auth: Principal): TenantScope | null {
	const reach = principalReach(auth);
	if (reach.organizationIds === null) return null;
	return {
		organizationIds: reach.organizationIds,
		...(reach.brandIds ? { brandIds: reach.brandIds } : {}),
		...(auth.kind === "user" ? { userId: auth.userId } : {}),
	};
}
