/** An OAuth token or an API key, resolved to one principal so a tool never
 * learns which arrived. */
import { verifyMcpAccessToken } from "@workspace/lib/auth/server";
import { serviceDb } from "@workspace/lib/db/db";
import { oauthClient, user } from "@workspace/lib/db/schema";
import { scopeOrganizations } from "@workspace/lib/db/tenant";
import { userTenantScope } from "@workspace/lib/or/tenant-scope";
import { eq } from "drizzle-orm";
import { type ApiAuthFailure, type Principal, resolveApiAuth, type UserAuth } from "@/lib/auth/api-auth";

export type McpAuthResult = { auth: Principal } | { failure: ApiAuthFailure };

/** Named in the `401` challenge so an unconfigured client can find the
 * authorization server. */
export const MCP_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";

/**
 * The same scope builder as the web pages: a client-role user reaches only the
 * brands granted to them. An instance admin over MCP stays bounded by their own
 * memberships rather than getting system scope.
 */
async function userReach(
	account: { id: string; role: string | null },
	listUserOrganizations: (userId: string) => Promise<Array<{ id: string }>>,
): Promise<Pick<UserAuth, "organizationIds" | "brandIds" | "restrictedOrganizationIds" | "adminOrganizationIds">> {
	const scope = await userTenantScope(account);
	if (!scope) {
		const organizations = await listUserOrganizations(account.id);
		return {
			organizationIds: organizations.map((org) => org.id),
			brandIds: null,
			restrictedOrganizationIds: [],
			adminOrganizationIds: [],
		};
	}
	return {
		organizationIds: scopeOrganizations(scope),
		brandIds: scope.brandIds ?? null,
		restrictedOrganizationIds: scope.restrictedOrganizationIds ?? [],
		adminOrganizationIds: scope.adminOrganizationIds ?? [],
	};
}

/**
 * A signature says the token was issued, not that the grant still stands, so
 * everything it cannot see is read fresh. Not the browser session: these grants
 * carry `offline_access` and better-auth keeps them through a sign-out.
 */
async function resolveOAuthPrincipal(request: Request): Promise<UserAuth | null> {
	// Deferred as in api-auth: constructing auth reads APP_URL and throws without
	// it, which would make the tool registry unimportable.
	const [{ auth }, { listUserOrganizations }] = await Promise.all([
		import("@/lib/auth/server"),
		import("@/lib/auth/helpers"),
	]);
	// Runs before any tenant scope exists; user and OAuth client rows are system tables.

	let claims: Awaited<ReturnType<typeof verifyMcpAccessToken>>;
	try {
		claims = await verifyMcpAccessToken(auth, request);
	} catch {
		return null;
	}

	const userId = typeof claims.sub === "string" ? claims.sub : null;
	const clientId = typeof claims.client_id === "string" ? claims.client_id : null;
	if (!userId || !clientId) return null;

	const [[account], [client]] = await Promise.all([
		serviceDb
			.select({ id: user.id, email: user.email, name: user.name, banned: user.banned, role: user.role })
			.from(user)
			.where(eq(user.id, userId))
			.limit(1),
		serviceDb
			.select({ disabled: oauthClient.disabled })
			.from(oauthClient)
			.where(eq(oauthClient.clientId, clientId))
			.limit(1),
	]);
	if (!account || account.banned) return null;
	if (!client || client.disabled) return null;

	return {
		kind: "user",
		userId: account.id,
		email: account.email ?? null,
		name: account.name ?? null,
		...(await userReach(account, listUserOrganizations)),
		clientId,
		expiresAt: typeof claims.exp === "number" ? new Date(claims.exp * 1000) : null,
	};
}

export async function resolveMcpAuth(request: Request): Promise<McpAuthResult> {
	const asKey = await resolveApiAuth(request);
	if ("auth" in asKey) return { auth: asKey.auth };
	// A spent key is a different answer from one that was never a key.
	if (asKey.failure.code === "rate_limited") return asKey;

	const asUser = await resolveOAuthPrincipal(request);
	if (asUser) return { auth: asUser };

	return asKey;
}
