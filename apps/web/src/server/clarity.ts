/** Online Reset (Packet 2c): DISABLE_TELEMETRY switches Clarity off too, as it does PostHog. */
export function resolveClarityProjectId(): string | undefined {
	if (process.env.DISABLE_TELEMETRY) return undefined;
	return process.env.VITE_CLARITY_PROJECT_ID || undefined;
}
