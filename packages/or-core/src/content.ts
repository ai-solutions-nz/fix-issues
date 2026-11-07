import { createHash } from "node:crypto";
import { normalisePhone } from "./audits";

/**
 * Content preparation and QA for the optimisation workflow. Drafts state only
 * facts from the business profile and the research brief: nothing here
 * invents prices, guarantees, credentials or reviews. QA enforces that.
 */
export interface ContentFacts {
	businessName: string;
	phone?: string | null;
	email?: string | null;
	streetAddress?: string | null;
	city: string;
	region?: string | null;
	postcode?: string | null;
	openingHours?: string | null;
	services: string[];
	serviceAreas: string[];
	website: string;
	sameAs?: string[];
}

export interface ResearchBrief {
	/** The opportunity this content answers. */
	opportunityTitle: string;
	topic: string;
	questions: string[];
	/** Competitors AI answers recommended for these questions (evidence, not copy). */
	competitorsRecommended: string[];
	citedSources: string[];
	/** Audit findings this content is meant to fix. */
	findings: string[];
}

export interface Draft {
	kind: "service_page" | "schema_fix";
	title: string;
	slug: string;
	metaDescription: string;
	/** Markdown body (service pages) or empty for a schema fix. */
	markdown: string;
	html: string;
	jsonLd: Record<string, unknown> | null;
	/** Statements the reviewer must confirm before approval, with where each came from. */
	claims: { text: string; source: "profile" | "research" }[];
}

export function slugify(s: string): string {
	return s
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

const escapeHtml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Minimal Markdown (headings, paragraphs, bullets) to HTML; enough for drafts we generate ourselves. */
export function markdownToHtml(md: string): string {
	const out: string[] = [];
	let list: string[] = [];
	const flush = () => {
		if (list.length) out.push(`<ul>${list.map((li) => `<li>${escapeHtml(li)}</li>`).join("")}</ul>`);
		list = [];
	};
	for (const line of md.split("\n")) {
		const h = /^(#{1,3})\s+(.*)$/.exec(line);
		if (h) {
			flush();
			out.push(`<h${(h[1] as string).length}>${escapeHtml(h[2] as string)}</h${(h[1] as string).length}>`);
		} else if (/^[-*]\s+/.test(line)) list.push(line.replace(/^[-*]\s+/, ""));
		else if (line.trim()) {
			flush();
			out.push(`<p>${escapeHtml(line.trim())}</p>`);
		} else flush();
	}
	flush();
	return out.join("\n");
}

/** LocalBusiness JSON-LD built only from profile facts (approach after GeoLook's gen_jsonld, MIT). */
export function localBusinessJsonLd(facts: ContentFacts, type = "LocalBusiness"): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": type,
		name: facts.businessName,
		url: facts.website,
		...(facts.phone ? { telephone: facts.phone } : {}),
		...(facts.email ? { email: facts.email } : {}),
		address: {
			"@type": "PostalAddress",
			...(facts.streetAddress ? { streetAddress: facts.streetAddress } : {}),
			addressLocality: facts.city,
			...(facts.region ? { addressRegion: facts.region } : {}),
			...(facts.postcode ? { postalCode: facts.postcode } : {}),
			addressCountry: "NZ",
		},
		areaServed: [facts.city, ...facts.serviceAreas].map((name) => ({ "@type": "Place", name })),
		...(facts.openingHours ? { openingHours: facts.openingHours } : {}),
		...(facts.sameAs?.length ? { sameAs: facts.sameAs } : {}),
	};
}

/** A service page that answers the brief's questions using only profile facts. */
export function draftServicePage(facts: ContentFacts, brief: ResearchBrief): Draft {
	const service = brief.topic;
	const title = `${service} in ${facts.city} | ${facts.businessName}`;
	const areas = facts.serviceAreas.length ? facts.serviceAreas.join(", ") : facts.city;
	const contact = [facts.phone ? `phone ${facts.phone}` : null, facts.email ? `email ${facts.email}` : null]
		.filter(Boolean)
		.join(" or ");
	const claims: Draft["claims"] = [
		{ text: `${facts.businessName} provides ${service.toLowerCase()} in ${facts.city}.`, source: "profile" },
		{ text: `Service areas: ${areas}.`, source: "profile" },
	];
	if (facts.openingHours) claims.push({ text: `Hours: ${facts.openingHours}.`, source: "profile" });
	if (contact) claims.push({ text: `Contact: ${contact}.`, source: "profile" });
	const markdown = [
		`# ${service} in ${facts.city}`,
		`${facts.businessName} provides ${service.toLowerCase()} for homes and businesses in ${facts.city}.`,
		"## Areas we cover",
		...facts.serviceAreas.map((a) => `- ${a}`),
		...(facts.openingHours ? ["## Hours", facts.openingHours] : []),
		"## Common questions",
		...brief.questions
			.slice(0, 5)
			.flatMap((q) => [`### ${q}`, `[REVIEWER: answer from the business's own knowledge before approving.]`]),
		"## Get in touch",
		contact ? `To book or ask about ${service.toLowerCase()}, ${contact}.` : `Contact ${facts.businessName} to book.`,
	].join("\n");
	return {
		kind: "service_page",
		title,
		slug: slugify(`${service} ${facts.city}`),
		metaDescription: `${service} in ${facts.city} from ${facts.businessName}. Serving ${areas}.`.slice(0, 160),
		markdown,
		html: markdownToHtml(markdown),
		jsonLd: localBusinessJsonLd(facts),
		claims,
	};
}

export function draftSchemaFix(facts: ContentFacts, findings: string[]): Draft {
	return {
		kind: "schema_fix",
		title: `Structured data update for ${facts.businessName}`,
		slug: "",
		metaDescription: "",
		markdown: "",
		html: "",
		jsonLd: localBusinessJsonLd(facts),
		claims: [{ text: `Fixes: ${findings.join("; ")}`, source: "research" }],
	};
}

export interface QaCheck {
	id: string;
	ok: boolean;
	detail: string;
	/** Blocking checks stop the draft reaching approval. */
	blocking: boolean;
}

const PHONE_PATTERN = /(?:\+64|\b0)[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{3,4}\b/g;
const PROHIBITED =
	/\b(guarantee[ds]?|cheapest|best in (nz|new zealand|christchurch)|number one|#1|100% satisfaction|award[- ]winning|certified by)\b/i;
const PRICE = /\$\s?\d/;
const AI_PHRASES = /\b(as an ai|in today's fast-paced world|delve into|unlock the power|in conclusion,)\b/i;

/** Factual-accuracy and quality gate. A draft with a failing blocking check cannot be sent for approval. */
export function qaDraft(draft: Draft, facts: ContentFacts): QaCheck[] {
	const text = `${draft.title}\n${draft.metaDescription}\n${draft.markdown}`;
	const phones = [...text.matchAll(PHONE_PATTERN)].map((m) => normalisePhone(m[0]));
	const wrongPhone = phones.filter((p) => !facts.phone || p !== normalisePhone(facts.phone));
	const checks: QaCheck[] = [
		{
			id: "facts.phone",
			ok: wrongPhone.length === 0,
			detail: wrongPhone.length
				? `Unknown phone numbers: ${wrongPhone.join(", ")}`
				: "Only the profile phone number appears.",
			blocking: true,
		},
		{
			id: "claims.prohibited",
			ok: !PROHIBITED.test(text),
			detail: PROHIBITED.test(text)
				? `Unsupported claim: "${PROHIBITED.exec(text)?.[0]}"`
				: "No guarantees, superlatives or unverified credentials.",
			blocking: true,
		},
		{
			id: "claims.prices",
			ok: !PRICE.test(text),
			detail: PRICE.test(text)
				? "Contains a price; prices must come from the business, not the draft."
				: "No invented prices.",
			blocking: true,
		},
		{
			id: "style.ai_phrases",
			ok: !AI_PHRASES.test(text),
			detail: AI_PHRASES.test(text) ? "Contains stock AI phrasing." : "No stock AI phrasing.",
			blocking: false,
		},
	];
	if (draft.kind === "service_page") {
		const words = draft.markdown.split(/\s+/).filter(Boolean).length;
		checks.push(
			{
				id: "relevance.location",
				ok: text.includes(facts.city),
				detail: `Mentions ${facts.city}: ${text.includes(facts.city)}.`,
				blocking: true,
			},
			{
				id: "relevance.business",
				ok: text.includes(facts.businessName),
				detail: `Names ${facts.businessName}: ${text.includes(facts.businessName)}.`,
				blocking: true,
			},
			{
				id: "structure.headings",
				ok: /^#\s/m.test(draft.markdown) && /^##\s/m.test(draft.markdown),
				detail: "Has a title heading and sections.",
				blocking: false,
			},
			{ id: "structure.length", ok: words >= 80, detail: `${words} words.`, blocking: false },
			{
				id: "review.placeholders",
				ok: !draft.markdown.includes("[REVIEWER:"),
				detail: draft.markdown.includes("[REVIEWER:")
					? "Reviewer placeholders remain; answers must be written by the business."
					: "No placeholders.",
				blocking: true,
			},
		);
	}
	if (draft.jsonLd) {
		const tel = typeof draft.jsonLd.telephone === "string" ? normalisePhone(draft.jsonLd.telephone) : null;
		checks.push({
			id: "schema.telephone",
			ok: !tel || (!!facts.phone && tel === normalisePhone(facts.phone)),
			detail: "JSON-LD telephone matches the profile.",
			blocking: true,
		});
	}
	return checks;
}

export const qaPassed = (checks: readonly QaCheck[]) => checks.every((c) => c.ok || !c.blocking);

/** What an approval is bound to: any change to the content after approval changes this hash. */
export function contentHash(
	draft: Pick<Draft, "title" | "slug" | "metaDescription" | "markdown" | "html" | "jsonLd">,
): string {
	return createHash("sha256")
		.update(JSON.stringify([draft.title, draft.slug, draft.metaDescription, draft.markdown, draft.html, draft.jsonLd]))
		.digest("hex");
}
