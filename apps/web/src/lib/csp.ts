/** The CSP source for the operator's PostHog host: its origin, or nothing when unset or not a URL. */
export function posthogCspSource(host: string | undefined): string {
	if (!host) return "";
	try {
		return new URL(host).origin;
	} catch {
		return "";
	}
}
