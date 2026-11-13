/**
 * Online Reset (Packet 2b): when a visitor is asked for cookie consent.
 *
 * Our hosted deployments (cloud, demo) ask as before, by region. Local and
 * whitelabel deployments now ask too whenever an analytics tool is
 * configured, and always before it runs: there is no region-based default
 * there, because the operator, not us, decides where it is served.
 */
import type { AnalyticsConfig, DeploymentMode } from "@workspace/config/types";

export function isHostedByUs(mode: DeploymentMode | undefined): boolean {
	return mode === "cloud" || mode === "demo";
}

/** An analytics tool that would set cookies or collect events. PostHog counts only with both key and host. */
export function hasAnalytics(analytics: AnalyticsConfig | undefined): boolean {
	return Boolean((analytics?.posthogKey && analytics?.posthogHost) || analytics?.clarityProjectId);
}

/** Whether this deployment shows the consent banner and the Cookie Preferences control. */
export function asksForConsent(mode: DeploymentMode | undefined, analytics: AnalyticsConfig | undefined): boolean {
	if (!mode) return false;
	return isHostedByUs(mode) || hasAnalytics(analytics);
}

/**
 * Whether trackers must wait for an explicit "accept". Hosted deployments
 * follow the visitor's region; every other deployment always waits.
 */
export function consentRequiredFor(mode: DeploymentMode | undefined, regionRequiresConsent: () => boolean): boolean {
	return isHostedByUs(mode) ? regionRequiresConsent() : true;
}
