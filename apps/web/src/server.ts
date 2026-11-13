import "../instrument.server.mjs";
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { assertTenantRoleReady } from "@workspace/lib/db/role-check";
import { startCredentialRefresh } from "@workspace/lib/secrets";
import { AD_TAG_CSP } from "@workspace/ui/lib/ad-tags";
import { posthogCspSource } from "@/lib/csp";

// Not awaited: the app has to serve sign-in and settings whether or not the
// credential store is reachable.
void startCredentialRefresh();

/**
 * Online Reset (Packet 1c): refuse to serve unless the database login is safe
 * for tenant isolation (member of or_tenant, not a superuser, no BYPASSRLS).
 * `OR_DB_ROLE_CHECK=warn` downgrades this to a warning for local development
 * against a superuser database, and only when NODE_ENV is explicitly
 * "development" or "test"; with NODE_ENV unset or anything else it exits.
 * A database that is down at startup also fails the check: the server exits
 * (fail-closed) and the host must restart it with back-off.
 */
const warnOnly =
	process.env.OR_DB_ROLE_CHECK === "warn" &&
	(process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test");
const databaseRoleReady = assertTenantRoleReady().then(
	() => undefined,
	(error: unknown) => {
		console.error("[startup] database role check failed:", error instanceof Error ? error.message : error);
		if (!warnOnly) process.exit(1);
	},
);

// HSTS asserts HTTPS-only for the host that served the response. Whitelabel
// deployments run on customer-controlled custom domains, where `includeSubDomains`
// would wrongly assert HTTPS across subdomains we don't own — so that directive
// is scoped to our own deployments. Browsers ignore HSTS received over plain
// HTTP, so it stays inert on localhost.
const strictTransportSecurity =
	process.env.DEPLOYMENT_MODE === "whitelabel" ? "max-age=63072000" : "max-age=63072000; includeSubDomains";

/**
 * Online Reset: the upstream PostHog proxy (var.elmohq.com) and the Crisp chat
 * hosts are gone from the policy. PostHog is allowed only at the host the
 * operator configured (VITE_POSTHOG_HOST); adding a support chat later needs
 * its hosts added here.
 */
const POSTHOG_SOURCE = posthogCspSource(process.env.VITE_POSTHOG_HOST);

const SECURITY_HEADERS: Record<string, string> = {
	"Content-Security-Policy": [
		"default-src 'self'",
		`script-src 'self' 'unsafe-inline' https://*.clarity.ms ${POSTHOG_SOURCE} https://challenges.cloudflare.com ${AD_TAG_CSP.script}`,
		`style-src 'self' 'unsafe-inline' ${AD_TAG_CSP.style}`,
		"img-src 'self' data: https: https://c.bing.com",
		`font-src 'self' data: ${AD_TAG_CSP.font}`,
		"media-src 'self'",
		"worker-src 'self' blob:",
		`frame-src 'self' https://challenges.cloudflare.com ${AD_TAG_CSP.frame}`,
		`connect-src 'self' ${POSTHOG_SOURCE} https://*.sentry.io https://*.clarity.ms https://c.bing.com ${AD_TAG_CSP.connect}`,
		"object-src 'none'",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'",
	].join("; "),
	"Strict-Transport-Security": strictTransportSecurity,
	"X-Frame-Options": "DENY",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	// same-origin-allow-popups (not same-origin) keeps OAuth/SSO popups that rely on
	// window.opener working while still isolating us from cross-origin openers.
	"Cross-Origin-Opener-Policy": "same-origin-allow-popups",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
};

function addSecurityHeaders(response: Response): Response {
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(key, value);
	}
	return response;
}

export default createServerEntry(
	wrapFetchWithSentry({
		async fetch(request: Request) {
			await databaseRoleReady;
			const response = await handler.fetch(request);
			return addSecurityHeaders(response);
		},
	}),
);
