/**
 * Online Reset: runs every server function for a signed-in user inside a
 * tenant transaction (see `@/lib/auth/tenant-scope`). Requests without a
 * session keep system scope, as before; those functions check the session
 * themselves and serve no tenant data.
 */
import { createMiddleware } from "@tanstack/react-start";
import { withTenantOrSystem } from "@workspace/lib/db/tenant";
import { tenantScopeForUser } from "@/lib/auth/tenant-scope";

type SessionContext = { session?: { user: { id: string; role?: string | null } } | null };

export const tenantMiddleware = createMiddleware({ type: "function" }).server(async ({ next, context }) => {
	const session = (context as SessionContext | undefined)?.session;
	if (!session) return next();
	const scope = await tenantScopeForUser(session.user);
	return withTenantOrSystem(scope, () => next());
});
