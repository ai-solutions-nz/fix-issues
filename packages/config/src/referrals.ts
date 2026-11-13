/** Links back to our sites carry a `ref` naming the surface clicked, since each wants different things. */
import { PUBLIC_APP_URL, PUBLIC_DEMO_URL, PUBLIC_SITE_URL } from "./brand-links";

/** Empty until the site exists (brand-links.ts); every helper below then returns "". */
export const MARKETING_SITE_URL = PUBLIC_SITE_URL;
export const CLOUD_APP_URL = PUBLIC_APP_URL;
const DEMO_SITE_URL = PUBLIC_DEMO_URL;

/** A closed set: in analytics a typo is indistinguishable from a real source. */
export type ReferralSource =
	| "cli"
	| "self-hosted-signin"
	| "self-hosted-signup"
	| "cloud-signin"
	| "cloud-signup"
	| "marketing-cta"
	| "marketing-nav"
	| "marketing-hero"
	| "marketing-ai-referral"
	| "marketing-demo-frame"
	| "marketing-closing"
	| "marketing-pricing-closing"
	| "marketing-aeo-for-hero"
	| "marketing-aeo-for-closing"
	| "marketing-profound-users-hero"
	| "marketing-profound-users-closing"
	| "marketing-features-hero"
	| "marketing-features-closing"
	| "marketing-page-cta"
	| "marketing-vision"
	| "marketing-about"
	| "marketing-support"
	| "marketing-webmcp"
	| "demo-chat"
	| "demo-header"
	| "demo-read-only"
	| "marketing-plan-starter"
	| "marketing-plan-basic"
	| "marketing-plan-pro"
	| "marketing-plan-business"
	| "marketing-pricing-starter"
	| "marketing-pricing-basic"
	| "marketing-pricing-pro"
	| "marketing-pricing-business";

/** `path` on `base`, tagged with `ref`; "" when `base` is not configured, so callers can hide the link. */
export function taggedUrl(base: string, path: string, ref: ReferralSource): string {
	if (!base) return "";
	const link = new URL(path, base);
	link.searchParams.set("ref", ref);
	return link.toString();
}

export function marketingUrl(path: string, ref: ReferralSource): string {
	return taggedUrl(MARKETING_SITE_URL, path, ref);
}

/** Routes new visitors to sign-up on its own. */
export function cloudAppUrl(ref: ReferralSource): string {
	return taggedUrl(CLOUD_APP_URL, "/", ref);
}

export function cloudSignupUrl(ref: ReferralSource): string {
	return taggedUrl(CLOUD_APP_URL, "/auth/register", ref);
}

export function cloudPricingUrl(ref: ReferralSource): string {
	return marketingUrl("/pricing", ref);
}

export function bookDemoUrl(ref: ReferralSource): string {
	return marketingUrl("/demo", ref);
}

export function demoSiteUrl(ref: ReferralSource, path = "/"): string {
	return taggedUrl(DEMO_SITE_URL, path, ref);
}
