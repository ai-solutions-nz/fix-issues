/**
 * FICTIONAL demonstration data. Kōwhai Plumbing & Gas and its three
 * competitors do not exist; every domain is a reserved `.example` domain and
 * every phone number is invented. Answers produced from this data are
 * fixtures and are stored and shown as SIMULATED.
 */
import type { BusinessContext } from "@workspace/or-core/questions";

export const DEMO_BUSINESS = {
	name: "Kōwhai Plumbing & Gas",
	aliases: ["Kowhai Plumbing", "Kōwhai Plumbing"],
	domain: "kowhai-plumbing.example",
	phone: "03 555 0142",
	streetAddress: "48 Example Road, Addington",
	city: "Christchurch",
	region: "Canterbury",
	postcode: "8011",
	openingHours: "Mo-Fr 07:00-17:30; after-hours emergency call-outs",
	services: [
		"Hot water cylinder replacement",
		"Blocked drains",
		"Gas fitting",
		"Leak detection",
		"Bathroom renovations",
		"Emergency plumbing",
	],
	serviceAreas: ["Riccarton", "Papanui", "Addington", "Sumner", "Halswell", "Rolleston"],
} as const;

export const DEMO_COMPETITORS = [
	{ name: "Southern Pipes Plumbing", domain: "southern-pipes.example", strength: 0.75 },
	{ name: "Avon Drainage Co", domain: "avon-drainage.example", strength: 0.5 },
	{ name: "Port Hills Plumbers", domain: "port-hills-plumbers.example", strength: 0.35 },
] as const;

export const DEMO_CONTEXT: BusinessContext = {
	brand: DEMO_BUSINESS.name,
	brandDomain: DEMO_BUSINESS.domain,
	trade: "plumber",
	services: [...DEMO_BUSINESS.services],
	city: DEMO_BUSINESS.city,
	suburbs: [...DEMO_BUSINESS.serviceAreas.slice(0, 4)],
	competitors: DEMO_COMPETITORS.map((c) => c.name),
};

const page = (title: string, body: string, jsonLd?: unknown) =>
	`<!doctype html><html lang="en-NZ"><head><title>${title}</title><meta name="description" content="${title}">${
		jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""
	}</head><body><main>${body}</main></body></html>`;

const filler = (topic: string) =>
	`<p>${topic} is something we handle every week for homes and businesses across Christchurch. We explain the options, give a written quote before starting, and clean up when the job is done. ${"Our registered plumbers carry stock in their vans so most jobs are finished in one visit. ".repeat(
		6,
	)}</p>`;

/** The client's site: deliberately incomplete so the audits have real findings (no hot-water page, schema missing areaServed, a stray second phone number). */
export function demoClientSite(): Record<string, string> {
	const b = DEMO_BUSINESS;
	const schema = {
		"@context": "https://schema.org",
		"@type": "Plumber",
		name: b.name,
		telephone: "+64 3 555 0142",
		url: `https://${b.domain}/`,
		address: {
			"@type": "PostalAddress",
			streetAddress: b.streetAddress,
			addressLocality: b.city,
			addressRegion: b.region,
			postalCode: b.postcode,
			addressCountry: "NZ",
		},
		openingHours: "Mo-Fr 07:00-17:30",
	};
	const nav = `<nav><a href="/blocked-drains">Blocked drains</a> <a href="/gas-fitting">Gas fitting</a> <a href="/about">About</a> <a href="/contact">Contact</a></nav>`;
	return {
		"/": page(
			`${b.name} | Christchurch plumbers`,
			`${nav}<h1>Christchurch plumbers you can rely on</h1><p>${b.name} serves Christchurch, Riccarton, Papanui and Addington. Call ${b.phone}. Open Monday to Friday, with after-hours emergency call-outs.</p><h2>Blocked drains</h2>${filler("Clearing blocked drains")}<h2>Gas fitting</h2>${filler("Gas fitting")}`,
			schema,
		),
		"/blocked-drains": page(
			"Blocked drains Christchurch",
			`${nav}<h1>Blocked drains</h1>${filler("Blocked drain clearing with CCTV inspection")}`,
		),
		"/gas-fitting": page("Gas fitting Christchurch", `${nav}<h1>Gas fitting</h1>${filler("Certified gas fitting")}`),
		"/about": page(
			`About ${b.name}`,
			`${nav}<h1>About us</h1><p>Family-owned since 2009. For accounts call 03 555 0199.</p>`,
		),
		"/contact": page("Contact", `${nav}<h1>Contact</h1><p>${b.streetAddress}, ${b.city}. Phone ${b.phone}.</p>`),
		"/robots.txt": "User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n",
	};
}

export function demoCompetitorSite(index: number): Record<string, string> {
	const c = DEMO_COMPETITORS[index] as (typeof DEMO_COMPETITORS)[number];
	const topics = [
		["Hot water cylinder replacement", "Emergency plumbing", "Blocked drains", "Heat pump water heaters"],
		["Blocked drains", "Drain CCTV inspection", "Stormwater repairs"],
		["Bathroom renovations", "Hot water cylinder replacement", "Leak detection"],
	][index] as string[];
	return {
		"/": page(
			`${c.name} | Christchurch`,
			`<h1>${c.name}</h1>${topics.map((t) => `<h2>${t}</h2>${filler(t)}`).join("")}`,
			{ "@context": "https://schema.org", "@type": "Plumber", name: c.name, areaServed: "Christchurch" },
		),
		"/robots.txt": "User-agent: *\nAllow: /\n",
	};
}

/** Deterministic pseudo-random in [0, 1) from a string. */
function unit(seed: string): number {
	let h = 2166136261;
	for (const ch of seed) h = Math.imul(h ^ (ch.codePointAt(0) as number), 16777619);
	return ((h >>> 0) % 10_000) / 10_000;
}

export const DEMO_ENGINES = ["chatgpt", "claude", "gemini", "perplexity"] as const;

const DIRECTORIES = ["trade-reviews.example", "chch-homes-guide.example", "nz-plumbing-forum.example"];

type DemoAnswer = { text: string; citations: { url: string; title: string }[] };

function demoAnswer(engine: string, q: string): DemoAnswer {
	const lower = q.toLowerCase();
	const covered = ["blocked drain", "gas fitting", "kōwhai", "kowhai"].some((s) => lower.includes(s));
	const weak = ["hot water", "emergency", "urgent"].some((s) => lower.includes(s));
	const clientChance = covered ? 0.8 : weak ? 0.1 : 0.35;
	const listed: string[] = DEMO_COMPETITORS.filter((c) => unit(`${engine}|${q}|${c.name}`) < c.strength).map(
		(c) => c.name,
	);
	if (unit(`${engine}|${q}|client`) < clientChance)
		listed.splice(Math.floor(unit(`${engine}|${q}|pos`) * (listed.length + 1)), 0, DEMO_BUSINESS.name);
	const text = listed.length
		? `SIMULATED ANSWER (${engine}). For "${q}", these Christchurch options come up often:\n\n${listed.map((n, i) => `${i + 1}. ${n} — well reviewed locally.`).join("\n")}\n\nCheck licensing with the Plumbers, Gasfitters and Drainlayers Board before booking.`
		: `SIMULATED ANSWER (${engine}). I could not find specific businesses to recommend for "${q}". Look for a registered plumber with recent local reviews.`;
	const dir = DIRECTORIES[Math.floor(unit(`${engine}|${q}|dir`) * DIRECTORIES.length)] as string;
	const citations = [{ url: `https://${dir}/christchurch/plumbers`, title: "Christchurch plumbers" }];
	if (listed.includes(DEMO_BUSINESS.name) && covered)
		citations.push({ url: `https://${DEMO_BUSINESS.domain}/`, title: DEMO_BUSINESS.name });
	return { text, citations };
}

/**
 * SIMULATED answers for each engine and question. The client is strong on the
 * services its site covers and weak where it has no page, so the opportunity
 * engine has something real to find.
 */
export function demoFixtureAnswers(questions: readonly string[]): {
	answers: Record<string, Record<string, DemoAnswer>>;
} {
	const answers: Record<string, Record<string, DemoAnswer>> = {};
	for (const engine of DEMO_ENGINES)
		answers[engine] = Object.fromEntries(questions.map((q) => [q, demoAnswer(engine, q)]));
	return { answers };
}
