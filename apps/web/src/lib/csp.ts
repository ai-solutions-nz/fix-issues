import type { CspSources } from "@workspace/ui/lib/ad-tags";

/**
 * The CSP source for the operator's PostHog host: its https origin, or nothing
 * when unset, not a URL, or not https (Packet 2c).
 */
export function posthogCspSource(host: string | undefined): string {
	if (!host) return "";
	try {
		const url = new URL(host);
		return url.protocol === "https:" ? url.origin : "";
	} catch {
		return "";
	}
}

const CLARITY_SCRIPT = "https://*.clarity.ms";
const CLARITY_CONNECT = "https://*.clarity.ms https://c.bing.com";

/**
 * Online Reset (Packet 2c): the policy names a third party only when that
 * party is configured. PostHog at its configured host only; Clarity only when
 * it is enabled; ad networks only when their ids are set (adTagCspFor).
 */
export function buildContentSecurityPolicy(options: {
	posthogHost?: string;
	clarity: boolean;
	adTags: CspSources;
}): string {
	const posthog = posthogCspSource(options.posthogHost);
	const sources = (...parts: string[]) => parts.filter(Boolean).join(" ");
	return [
		"default-src 'self'",
		`script-src ${sources("'self'", "'unsafe-inline'", options.clarity ? CLARITY_SCRIPT : "", posthog, "https://challenges.cloudflare.com", options.adTags.script)}`,
		`style-src ${sources("'self'", "'unsafe-inline'", options.adTags.style)}`,
		"img-src 'self' data: https:",
		`font-src ${sources("'self'", "data:", options.adTags.font)}`,
		"media-src 'self'",
		"worker-src 'self' blob:",
		`frame-src ${sources("'self'", "https://challenges.cloudflare.com", options.adTags.frame)}`,
		`connect-src ${sources("'self'", posthog, "https://*.sentry.io", options.clarity ? CLARITY_CONNECT : "", options.adTags.connect)}`,
		"object-src 'none'",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'",
	].join("; ");
}
