/**
 * Online Reset audits over pages already fetched and parsed by the Elmo
 * site-audit crawler. Pure functions: the same pages and profile always give
 * the same findings, and every finding names the pages it rests on.
 */
export interface AuditPage {
	url: string;
	title: string;
	metaDescription: string;
	text: string;
	headings: { level: number; text: string }[];
	jsonLd: Record<string, unknown>[];
}

export interface BrandProfileFacts {
	name: string;
	legalName?: string | null;
	phone?: string | null;
	email?: string | null;
	streetAddress?: string | null;
	city?: string | null;
	region?: string | null;
	postcode?: string | null;
	openingHours?: string | null;
	services: string[];
	serviceAreas: string[];
	sameAs: string[];
}

export type FindingCategory =
	| "brand_identity"
	| "structured_data"
	| "content_quality"
	| "intent_coverage"
	| "competitor_gap";
export type Severity = "high" | "medium" | "low";

export interface Finding {
	id: string;
	category: FindingCategory;
	status: "pass" | "fail" | "warn";
	severity: Severity;
	title: string;
	evidence: string;
	fix?: string;
	pages: string[];
}

const digits = (s: string) => s.replace(/\D/g, "");
/** NZ numbers written as +64 3 ... or 03 ... are the same number. */
export function normalisePhone(s: string): string {
	const d = digits(s);
	return d.startsWith("64") ? `0${d.slice(2)}` : d;
}

const PHONE_PATTERN = /(?:\+64|\b0)[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{3,4}\b/g;

function pagesContaining(pages: readonly AuditPage[], needle: string): string[] {
	const n = needle.toLowerCase();
	return pages.filter((p) => `${p.title}\n${p.text}`.toLowerCase().includes(n)).map((p) => p.url);
}

const LOCAL_BUSINESS_TYPES = new Set([
	"LocalBusiness",
	"Organization",
	"HomeAndConstructionBusiness",
	"Plumber",
	"Electrician",
	"HVACBusiness",
	"RoofingContractor",
	"GeneralContractor",
	"Locksmith",
	"MovingCompany",
	"HousePainter",
	"ProfessionalService",
	"AutoRepair",
	"Dentist",
	"LegalService",
]);

function nodes(page: AuditPage): Record<string, unknown>[] {
	const out: Record<string, unknown>[] = [];
	const visit = (v: unknown) => {
		if (Array.isArray(v)) v.forEach(visit);
		else if (v && typeof v === "object") {
			const o = v as Record<string, unknown>;
			out.push(o);
			if (Array.isArray(o["@graph"])) (o["@graph"] as unknown[]).forEach(visit);
		}
	};
	page.jsonLd.forEach(visit);
	return out;
}

const typesOf = (n: Record<string, unknown>) =>
	(Array.isArray(n["@type"]) ? (n["@type"] as string[]) : [n["@type"] as string]).filter(Boolean);
const str = (v: unknown) => (typeof v === "string" ? v : "");

function businessNode(pages: readonly AuditPage[]): { node: Record<string, unknown>; url: string } | null {
	for (const p of pages)
		for (const n of nodes(p)) if (typesOf(n).some((t) => LOCAL_BUSINESS_TYPES.has(t))) return { node: n, url: p.url };
	return null;
}

function finding(f: Omit<Finding, "status"> & { ok: boolean; warnOnly?: boolean }): Finding {
	const { ok, warnOnly, ...rest } = f;
	return { ...rest, status: ok ? "pass" : warnOnly ? "warn" : "fail", ...(ok ? { fix: undefined } : {}) };
}

function checkName(pages: readonly AuditPage[], profile: BrandProfileFacts): Finding {
	const namePages = pagesContaining(pages, profile.name);
	return finding({
		id: "brand.name_on_site",
		category: "brand_identity",
		severity: "high",
		ok: namePages.length > 0,
		title: "Business name appears on the website",
		evidence: namePages.length
			? `"${profile.name}" found on ${namePages.length} page(s).`
			: `"${profile.name}" was not found on any crawled page.`,
		fix: "Use the business name exactly as customers search for it in the homepage title and heading.",
		pages: namePages,
	});
}

function phonesSeen(pages: readonly AuditPage[]): Map<string, string[]> {
	const seen = new Map<string, string[]>();
	for (const p of pages)
		for (const m of p.text.match(PHONE_PATTERN) ?? [])
			seen.set(normalisePhone(m), [...(seen.get(normalisePhone(m)) ?? []), p.url]);
	return seen;
}

function checkPhone(pages: readonly AuditPage[], phone: string): Finding[] {
	const want = normalisePhone(phone);
	const seen = phonesSeen(pages);
	const matching = [...new Set(seen.get(want) ?? [])];
	const out = [
		finding({
			id: "brand.phone_on_site",
			category: "brand_identity",
			severity: "high",
			ok: matching.length > 0,
			title: "Phone number on the website matches the business profile",
			evidence: matching.length
				? `${phone} found on ${matching.length} page(s).`
				: `${phone} was not found; numbers seen: ${[...seen.keys()].join(", ") || "none"}.`,
			fix: "Show the main phone number in the header or footer of every page.",
			pages: matching,
		}),
	];
	const others = [...seen.keys()].filter((k) => k !== want);
	if (others.length > 0) {
		out.push(
			finding({
				id: "brand.phone_consistency",
				category: "brand_identity",
				severity: "medium",
				ok: false,
				warnOnly: true,
				title: "Other phone numbers appear on the website",
				evidence: `Besides the profile number, the site shows: ${others.join(", ")}. AI engines may repeat whichever they read.`,
				fix: "Remove or explain secondary numbers so one number represents the business.",
				pages: [...new Set(others.flatMap((o) => seen.get(o) ?? []))],
			}),
		);
	}
	return out;
}

function checkPresence(
	pages: readonly AuditPage[],
	f: { id: string; severity: Severity; title: string; needle: string; found: string; missing: string; fix: string },
): Finding {
	const where = pagesContaining(pages, f.needle);
	return finding({
		id: f.id,
		category: "brand_identity",
		severity: f.severity,
		ok: where.length > 0,
		title: f.title,
		evidence: where.length ? `${f.found} on ${where.length} page(s).` : f.missing,
		fix: f.fix,
		pages: where,
	});
}

/** Is the business described on its own site the way its profile says it is? */
export function auditBrandIdentity(pages: readonly AuditPage[], profile: BrandProfileFacts): Finding[] {
	const out: Finding[] = [checkName(pages, profile)];
	if (profile.phone) out.push(...checkPhone(pages, profile.phone));
	if (profile.city) {
		out.push(
			checkPresence(pages, {
				id: "brand.location_on_site",
				severity: "high",
				title: `Service location (${profile.city}) is stated on the website`,
				needle: profile.city,
				found: `${profile.city} mentioned`,
				missing: `${profile.city} is not mentioned on any crawled page.`,
				fix: `State clearly that the business serves ${profile.city}, ideally with its street address.`,
			}),
		);
	}
	if (profile.streetAddress) {
		out.push(
			checkPresence(pages, {
				id: "brand.address_on_site",
				severity: "medium",
				title: "Street address is shown on the website",
				needle: profile.streetAddress,
				found: "Address found",
				missing: "Street address not found.",
				fix: "Publish the street address on the contact page and in the footer.",
			}),
		);
	}
	if (profile.openingHours) {
		const hours = pages.filter((p) => /\b(mon|monday|hours|open)\b/i.test(p.text)).map((p) => p.url);
		out.push(
			finding({
				id: "brand.hours_on_site",
				category: "brand_identity",
				severity: "low",
				ok: hours.length > 0,
				title: "Opening hours are published",
				evidence: hours.length ? "Opening hours text found." : "No opening hours found.",
				fix: "Publish opening hours, including after-hours availability if offered.",
				pages: hours,
			}),
		);
	}
	const home = pages[0];
	if (home && !home.title.toLowerCase().includes(profile.name.toLowerCase())) {
		out.push(
			finding({
				id: "brand.home_title",
				category: "brand_identity",
				severity: "low",
				ok: false,
				warnOnly: true,
				title: "Homepage title names the business",
				evidence: `Homepage title is "${home.title}".`,
				fix: `Include "${profile.name}" in the homepage <title>.`,
				pages: [home.url],
			}),
		);
	}
	return out;
}

/** Does the site's structured data describe the business completely and correctly? */
export function auditStructuredData(pages: readonly AuditPage[], profile: BrandProfileFacts): Finding[] {
	const found = businessNode(pages);
	if (!found) {
		return [
			finding({
				id: "schema.local_business",
				category: "structured_data",
				severity: "high",
				ok: false,
				title: "LocalBusiness structured data is present",
				evidence: "No LocalBusiness or Organization JSON-LD was found on any crawled page.",
				fix: "Add LocalBusiness JSON-LD (or a specific subtype such as Plumber) with name, address, telephone, url, areaServed and openingHours.",
				pages: [],
			}),
		];
	}
	const { node, url } = found;
	const address = (node.address ?? {}) as Record<string, unknown>;
	const out: Finding[] = [
		finding({
			id: "schema.local_business",
			category: "structured_data",
			severity: "high",
			ok: true,
			title: "LocalBusiness structured data is present",
			evidence: `Type ${typesOf(node).join(", ")} on ${url}.`,
			pages: [url],
		}),
	];
	const required: [string, boolean][] = [
		["name", !!str(node.name)],
		["telephone", !!str(node.telephone)],
		["address.addressLocality", !!str(address.addressLocality)],
		["url", !!str(node.url)],
	];
	const recommended: [string, boolean][] = [
		["openingHours / openingHoursSpecification", !!(node.openingHours || node.openingHoursSpecification)],
		["areaServed", !!node.areaServed],
		["sameAs", Array.isArray(node.sameAs) ? node.sameAs.length > 0 : !!node.sameAs],
		["address.streetAddress", !!str(address.streetAddress)],
		["geo", !!node.geo],
	];
	const missingReq = required.filter(([, ok]) => !ok).map(([k]) => k);
	const missingRec = recommended.filter(([, ok]) => !ok).map(([k]) => k);
	out.push(
		finding({
			id: "schema.required_properties",
			category: "structured_data",
			severity: "high",
			ok: missingReq.length === 0,
			title: "Business schema has the essential properties",
			evidence: missingReq.length ? `Missing: ${missingReq.join(", ")}.` : "name, telephone, locality and url present.",
			fix: `Add ${missingReq.join(", ")} to the LocalBusiness JSON-LD.`,
			pages: [url],
		}),
		finding({
			id: "schema.recommended_properties",
			category: "structured_data",
			severity: "medium",
			ok: missingRec.length === 0,
			warnOnly: true,
			title: "Business schema has the recommended properties",
			evidence: missingRec.length ? `Missing: ${missingRec.join(", ")}.` : "All recommended properties present.",
			fix: `Add ${missingRec.join(", ")} so AI engines can confirm hours, area and identity.`,
			pages: [url],
		}),
	);
	const mismatches: string[] = [];
	if (profile.phone && str(node.telephone) && normalisePhone(str(node.telephone)) !== normalisePhone(profile.phone))
		mismatches.push(`telephone is ${str(node.telephone)}, profile says ${profile.phone}`);
	if (
		profile.city &&
		str(address.addressLocality) &&
		str(address.addressLocality).toLowerCase() !== profile.city.toLowerCase()
	)
		mismatches.push(`addressLocality is ${str(address.addressLocality)}, profile says ${profile.city}`);
	if (
		str(node.name) &&
		str(node.name).toLowerCase() !== profile.name.toLowerCase() &&
		str(node.name).toLowerCase() !== (profile.legalName ?? "").toLowerCase()
	)
		mismatches.push(`name is "${str(node.name)}", profile says "${profile.name}"`);
	out.push(
		finding({
			id: "schema.accuracy",
			category: "structured_data",
			severity: "high",
			ok: mismatches.length === 0,
			title: "Business schema agrees with the business profile",
			evidence: mismatches.length ? `Conflicts: ${mismatches.join("; ")}.` : "No conflicts with the profile.",
			fix: "Correct the JSON-LD so it matches the business's verified details.",
			pages: [url],
		}),
	);
	const faq = pages.filter((p) => nodes(p).some((n) => typesOf(n).includes("FAQPage"))).map((p) => p.url);
	out.push(
		finding({
			id: "schema.faq",
			category: "structured_data",
			severity: "low",
			ok: faq.length > 0,
			warnOnly: true,
			title: "FAQ structured data answers buyer questions",
			evidence: faq.length ? `FAQPage on ${faq.length} page(s).` : "No FAQPage structured data found.",
			fix: "Add an FAQ section (with FAQPage JSON-LD) answering the questions buyers ask AI assistants.",
			pages: faq,
		}),
	);
	return out;
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function auditContentQuality(pages: readonly AuditPage[]): Finding[] {
	const thin = pages.filter((p) => wordCount(p.text) < 250).map((p) => p.url);
	const noMeta = pages.filter((p) => !p.metaDescription.trim()).map((p) => p.url);
	const noH1 = pages.filter((p) => !p.headings.some((h) => h.level === 1)).map((p) => p.url);
	const titles = new Map<string, string[]>();
	for (const p of pages)
		titles.set(p.title.trim().toLowerCase(), [...(titles.get(p.title.trim().toLowerCase()) ?? []), p.url]);
	const dupes = [...titles.values()].filter((u) => u.length > 1).flat();
	return [
		finding({
			id: "content.thin_pages",
			category: "content_quality",
			severity: "medium",
			ok: thin.length === 0,
			warnOnly: true,
			title: "Pages have enough substance to be cited",
			evidence: thin.length ? `${thin.length} page(s) under 250 words.` : "No thin pages.",
			fix: "Expand thin pages with specific, factual detail (prices, process, areas, guarantees).",
			pages: thin,
		}),
		finding({
			id: "content.meta_description",
			category: "content_quality",
			severity: "low",
			ok: noMeta.length === 0,
			warnOnly: true,
			title: "Pages have meta descriptions",
			evidence: noMeta.length ? `${noMeta.length} page(s) without one.` : "All pages have one.",
			fix: "Write a specific meta description per page.",
			pages: noMeta,
		}),
		finding({
			id: "content.h1",
			category: "content_quality",
			severity: "low",
			ok: noH1.length === 0,
			warnOnly: true,
			title: "Pages have a main heading",
			evidence: noH1.length ? `${noH1.length} page(s) without an H1.` : "All pages have an H1.",
			fix: "Give each page one H1 that states what it is about.",
			pages: noH1,
		}),
		finding({
			id: "content.duplicate_titles",
			category: "content_quality",
			severity: "low",
			ok: dupes.length === 0,
			warnOnly: true,
			title: "Page titles are unique",
			evidence: dupes.length ? `${dupes.length} page(s) share a title.` : "Titles are unique.",
			fix: "Give every page a distinct title.",
			pages: dupes,
		}),
	];
}

const significant = (s: string) =>
	s
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(
			(w) => w.length > 3 && !["with", "your", "from", "best", "what", "which", "near", "does", "cost"].includes(w),
		);

/** True when some page's title or headings carry most of the topic's significant words. */
export function pagesCovering(pages: readonly AuditPage[], topic: string): string[] {
	const words = significant(topic);
	if (words.length === 0) return [];
	return pages
		.filter((p) => {
			const hay = `${p.title} ${p.headings.map((h) => h.text).join(" ")}`.toLowerCase();
			return words.filter((w) => hay.includes(w.replace(/s$/, ""))).length / words.length >= 0.6;
		})
		.map((p) => p.url);
}

/** Does the site have a page for each service and each service area buyers ask about? */
export function auditIntentCoverage(pages: readonly AuditPage[], profile: BrandProfileFacts): Finding[] {
	const out: Finding[] = [];
	for (const service of profile.services) {
		const covering = pagesCovering(pages, service);
		out.push(
			finding({
				id: `intent.service:${service.toLowerCase()}`,
				category: "intent_coverage",
				severity: "high",
				ok: covering.length > 0,
				title: `A page covers "${service}"`,
				evidence: covering.length
					? `Covered by ${covering.join(", ")}.`
					: `No page title or heading is about ${service}.`,
				fix: `Publish a dedicated ${service} page for ${profile.city ?? "the service area"}, with price guidance, process and FAQs.`,
				pages: covering,
			}),
		);
	}
	for (const area of profile.serviceAreas) {
		const mentions = pagesContaining(pages, area);
		out.push(
			finding({
				id: `intent.area:${area.toLowerCase()}`,
				category: "intent_coverage",
				severity: "medium",
				ok: mentions.length > 0,
				warnOnly: true,
				title: `The site says it serves ${area}`,
				evidence: mentions.length ? `${area} mentioned on ${mentions.length} page(s).` : `${area} is not mentioned.`,
				fix: `Mention ${area} on the service-area page so local questions can be answered from the site.`,
				pages: mentions,
			}),
		);
	}
	return out;
}

/** Topics competitors' pages cover (by heading) that the client's site does not. */
export function auditCompetitorGap(
	clientPages: readonly AuditPage[],
	competitorPages: Record<string, readonly AuditPage[]>,
): Finding[] {
	const topics = new Map<string, { competitors: Set<string>; pages: Set<string>; heading: string }>();
	for (const [competitor, pages] of Object.entries(competitorPages)) {
		for (const p of pages) {
			for (const h of p.headings.filter((x) => x.level <= 2)) {
				const key = significant(h.text).sort().join(" ");
				if (!key) continue;
				const entry = topics.get(key) ?? { competitors: new Set(), pages: new Set(), heading: h.text };
				entry.competitors.add(competitor);
				entry.pages.add(p.url);
				topics.set(key, entry);
			}
		}
	}
	return [...topics.values()]
		.filter((t) => pagesCovering(clientPages, t.heading).length === 0)
		.sort((a, b) => b.competitors.size - a.competitors.size || a.heading.localeCompare(b.heading))
		.map((t) =>
			finding({
				id: `gap.topic:${t.heading.toLowerCase()}`,
				category: "competitor_gap",
				severity: t.competitors.size > 1 ? "high" : "medium",
				ok: false,
				warnOnly: true,
				title: `Competitors cover "${t.heading}" and the client does not`,
				evidence: `${[...t.competitors].join(", ")} publish this topic; no client page title or heading covers it.`,
				fix: `Consider a page or section on "${t.heading}" if the business offers it.`,
				pages: [...t.pages],
			}),
		);
}

export interface CategoryScore {
	category: FindingCategory;
	/** 0–100: pass = 1, warn = 0.5, fail = 0, weighted by severity. Null when nothing was checked. */
	score: number | null;
	pass: number;
	warn: number;
	fail: number;
}

const WEIGHT: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

export function scoreFindings(findings: readonly Finding[]): CategoryScore[] {
	const categories = [...new Set(findings.map((f) => f.category))];
	return categories.map((category) => {
		const list = findings.filter((f) => f.category === category);
		const total = list.reduce((s, f) => s + WEIGHT[f.severity], 0);
		const got = list.reduce(
			(s, f) => s + WEIGHT[f.severity] * (f.status === "pass" ? 1 : f.status === "warn" ? 0.5 : 0),
			0,
		);
		return {
			category,
			score: total ? Math.round((got / total) * 100) : null,
			pass: list.filter((f) => f.status === "pass").length,
			warn: list.filter((f) => f.status === "warn").length,
			fail: list.filter((f) => f.status === "fail").length,
		};
	});
}

/** Brand completeness: share of the profile's facts the site and its schema confirm. */
export function brandCompleteness(findings: readonly Finding[]): number | null {
	const relevant = findings.filter((f) => f.category === "brand_identity" || f.id.startsWith("schema."));
	if (relevant.length === 0) return null;
	return Math.round((relevant.filter((f) => f.status === "pass").length / relevant.length) * 100);
}
