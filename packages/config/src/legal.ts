/** Shared by the product and the marketing site so the two can't drift apart on a policy URL. */
import { PUBLIC_LEGAL_URL } from "./brand-links";
import type { DeploymentMode } from "./types";

/** Empty until Online Reset publishes its own legal documents (brand-links.ts). */
const LEGAL_SITE_URL = PUBLIC_LEGAL_URL;

interface LegalDocument {
	slug: string;
	title: string;
}

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
	{ slug: "terms", title: "Terms of Service" },
	{ slug: "privacy", title: "Privacy Policy" },
	{ slug: "cookies", title: "Cookie Policy" },
	{ slug: "subprocessors", title: "Subprocessors" },
	{ slug: "acceptable-use", title: "Acceptable Use" },
];

/** "" while no legal site is configured, so no link points at another party's agreements. */
export function legalUrl(slug: string): string {
	return LEGAL_SITE_URL ? `${LEGAL_SITE_URL}/legal/${slug}` : "";
}

/** Whitelabel deployments run under someone else's agreements, not ours; none are shown until ours exist. */
export function showsLegalLinks(mode: DeploymentMode | undefined): boolean {
	return Boolean(LEGAL_SITE_URL) && (mode === "cloud" || mode === "demo" || mode === "local");
}

/** Self-hosted deployments are governed by whoever runs them, so only ours ask for cookie consent. */
export function isElmoHosted(mode: DeploymentMode | undefined): boolean {
	return mode === "cloud" || mode === "demo";
}
