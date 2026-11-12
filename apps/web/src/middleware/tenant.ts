/**
 * Online Reset: runs every server function inside a tenant transaction (see
 * `@/lib/auth/tenant-scope`). A signed-in user gets their own scope. A request
 * without a session gets an empty scope, in which row-level security shows no
 * tenant row at all, unless the function is on the allowlist below.
 */
import { createMiddleware } from "@tanstack/react-start";
import { withTenant, withTenantOrSystem } from "@workspace/lib/db/tenant";
import { tenantScopeForUser } from "@/lib/auth/tenant-scope";

type SessionContext = { session?: { user: { id: string; role?: string | null } } | null };
type FnMeta = { name?: string; filename?: string } | undefined;

/**
 * Server functions a signed-out visitor may run at system scope, keyed by
 * source file and function name. Each serves no tenant data: instance
 * configuration, the session itself, the cookie-consent region.
 */
export const SIGNED_OUT_SYSTEM_FUNCTIONS: ReadonlySet<string> = new Set([
	"src/server/config.ts#getClientConfig",
	"src/server/config.ts#getEnvValidationStateFn",
	"src/lib/auth/session.ts#getSession",
	"src/lib/consent-region.ts#getConsentRegion",
]);

export function isSignedOutSystemFunction(meta: FnMeta): boolean {
	if (!meta?.name || !meta.filename) return false;
	const file = meta.filename.replace(/\\/g, "/").replace(/^.*?(src\/)/, "$1");
	return SIGNED_OUT_SYSTEM_FUNCTIONS.has(`${file}#${meta.name}`);
}

/** Exported for tests: what a server function runs inside. */
export async function runServerFnInTenant<T>(
	session: SessionContext["session"],
	meta: FnMeta,
	next: () => Promise<T>,
): Promise<T> {
	if (session) return withTenantOrSystem(await tenantScopeForUser(session.user), next);
	if (isSignedOutSystemFunction(meta)) return next();
	return withTenant({ organizationIds: [] }, next);
}

export const tenantMiddleware = createMiddleware({ type: "function" }).server(async ({ next, context, serverFnMeta }) =>
	runServerFnInTenant((context as SessionContext | undefined)?.session, serverFnMeta as FnMeta, () => next()),
);
