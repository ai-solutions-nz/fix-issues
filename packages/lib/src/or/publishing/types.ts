export interface PublishablePage {
	title: string;
	slug: string;
	html: string;
	metaDescription: string;
	jsonLd: Record<string, unknown> | null;
}

export interface PublishResult {
	remoteId: string;
	url: string;
	/** What was there before, for rollback; null when the page is new. */
	snapshot: Record<string, unknown> | null;
}

/** A client CMS that Online Reset can write to after approval. */
export interface PublishTarget {
	kind: "wordpress" | "shopify";
	publish(page: PublishablePage): Promise<PublishResult>;
	/** Restore the snapshot, or take a newly created page out of public view. */
	rollback(result: PublishResult): Promise<void>;
}

export class PublishError extends Error {
	constructor(
		readonly code: "AUTH_INVALID" | "NOT_FOUND" | "RATE_LIMITED" | "UPSTREAM_ERROR",
		message: string,
		readonly status?: number,
	) {
		super(message);
	}
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Never let a credential reach a log or an error message. */
export function redact(text: string, secrets: (string | null | undefined)[]): string {
	return secrets
		.filter((s): s is string => !!s && s.length >= 4)
		.reduce((t, s) => t.replace(new RegExp(escapeRegExp(s), "g"), "***"), text);
}

export function withJsonLd(html: string, jsonLd: Record<string, unknown> | null): string {
	return jsonLd
		? `${html}\n<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`
		: html;
}
