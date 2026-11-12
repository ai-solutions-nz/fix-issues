/**
 * Online Reset: the database tenant scope for each kind of caller. Every web
 * entry point (server functions, /api/v1, MCP tools) runs inside it, so
 * Postgres row-level security bounds what the request can read or write even
 * if an application-level check were missed.
 */
import type { TenantScope } from "@workspace/lib/db/tenant";
import { userTenantScope } from "@workspace/lib/or/tenant-scope";
import { type Principal, principalReach } from "@/lib/auth/api-auth";

/**
 * A signed-in user on the web pages. The same builder scopes them over MCP, so
 * a client-role user gets only their granted brands whichever way they arrive.
 */
export const tenantScopeForUser = userTenantScope;

/** An API key or MCP connection sees exactly its reach; an instance admin key gets system scope. */
export function tenantScopeForPrincipal(auth: Principal): TenantScope | null {
	const reach = principalReach(auth);
	if (reach.organizationIds === null) return null;
	return {
		organizationIds: reach.organizationIds,
		...(reach.brandIds ? { brandIds: reach.brandIds } : {}),
		...(auth.kind === "user"
			? {
					userId: auth.userId,
					restrictedOrganizationIds: auth.restrictedOrganizationIds,
					adminOrganizationIds: auth.adminOrganizationIds,
				}
			: {}),
		// A brand-scoped key is restricted like a client user: no API keys or subscription.
		...(auth.kind === "organization" && auth.brandIds ? { restrictedOrganizationIds: [auth.organizationId] } : {}),
	};
}
