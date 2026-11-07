import { describe, expect, it } from "vitest";
import {
	type AuditPage,
	auditBrandIdentity,
	auditCompetitorGap,
	auditContentQuality,
	auditIntentCoverage,
	auditStructuredData,
	brandCompleteness,
	normalisePhone,
	scoreFindings,
} from "./audits";

const profile = {
	name: "Kōwhai Plumbing",
	phone: "03 555 0142",
	streetAddress: "12 Example Street",
	city: "Christchurch",
	openingHours: "Mo-Fr 07:00-17:00",
	services: ["Hot water cylinder replacement", "Blocked drains"],
	serviceAreas: ["Riccarton", "Papanui"],
	sameAs: [],
};

const page = (url: string, over: Partial<AuditPage>): AuditPage => ({
	url,
	title: "",
	metaDescription: "",
	text: "",
	headings: [],
	jsonLd: [],
	...over,
});

const site = [
	page("https://k.example/", {
		title: "Kōwhai Plumbing — Christchurch plumbers",
		metaDescription: "Plumbers in Christchurch",
		text: "Kōwhai Plumbing serves Christchurch and Riccarton. Call 03 555 0142 or +64 3 555 9999. Open Monday to Friday.",
		headings: [
			{ level: 1, text: "Christchurch plumbers" },
			{ level: 2, text: "Blocked drains" },
		],
		jsonLd: [
			{
				"@context": "https://schema.org",
				"@type": "Plumber",
				name: "Kōwhai Plumbing",
				telephone: "+64 3 555 0142",
				url: "https://k.example/",
				address: { "@type": "PostalAddress", addressLocality: "Christchurch" },
			},
		],
	}),
];

describe("brand identity audit", () => {
	it("treats +64 and 0-prefixed NZ numbers as the same", () => {
		expect(normalisePhone("+64 3 555 0142")).toBe(normalisePhone("03 555 0142"));
	});

	it("confirms profile facts and flags conflicting phone numbers", () => {
		const f = Object.fromEntries(auditBrandIdentity(site, profile).map((x) => [x.id, x.status]));
		expect(f).toMatchObject({
			"brand.name_on_site": "pass",
			"brand.phone_on_site": "pass",
			"brand.location_on_site": "pass",
			"brand.address_on_site": "fail",
			"brand.phone_consistency": "warn",
			"brand.hours_on_site": "pass",
		});
	});
});

describe("structured data audit", () => {
	it("checks presence, completeness and agreement with the profile", () => {
		const f = Object.fromEntries(auditStructuredData(site, profile).map((x) => [x.id, x]));
		expect(f["schema.local_business"]?.status).toBe("pass");
		expect(f["schema.required_properties"]?.status).toBe("pass");
		expect(f["schema.recommended_properties"]?.evidence).toContain("areaServed");
		expect(f["schema.accuracy"]?.status).toBe("pass");
	});

	it("reports conflicts between schema and profile", () => {
		const wrong = [
			page("https://k.example/", {
				jsonLd: [
					{
						"@type": "LocalBusiness",
						name: "Kowhai Plumbing Ltd",
						telephone: "09 111 2222",
						address: { addressLocality: "Auckland" },
					},
				],
			}),
		];
		const acc = auditStructuredData(wrong, profile).find((x) => x.id === "schema.accuracy");
		expect(acc?.status).toBe("fail");
		expect(acc?.evidence).toMatch(/telephone.*addressLocality.*name/);
	});

	it("fails when there is no business schema", () => {
		expect(auditStructuredData([page("https://k.example/", {})], profile)[0]?.status).toBe("fail");
	});
});

describe("content, intent and competitor audits", () => {
	it("finds missing service pages and areas", () => {
		const f = Object.fromEntries(auditIntentCoverage(site, profile).map((x) => [x.id, x.status]));
		expect(f["intent.service:blocked drains"]).toBe("pass");
		expect(f["intent.service:hot water cylinder replacement"]).toBe("fail");
		expect(f["intent.area:papanui"]).toBe("warn");
	});

	it("flags thin pages", () => {
		expect(auditContentQuality(site).find((x) => x.id === "content.thin_pages")?.status).toBe("warn");
	});

	it("lists topics competitors cover that the client does not", () => {
		const gaps = auditCompetitorGap(site, {
			"Southern Pipes": [
				page("https://sp.example/", {
					headings: [
						{ level: 2, text: "Gas fitting" },
						{ level: 2, text: "Blocked drains" },
					],
				}),
			],
			"Avon Drainage": [page("https://ad.example/", { headings: [{ level: 1, text: "Gas fitting services" }] })],
		});
		expect(gaps.map((g) => g.title)).toEqual([
			'Competitors cover "Gas fitting" and the client does not',
			'Competitors cover "Gas fitting services" and the client does not',
		]);
	});

	it("scores categories and brand completeness", () => {
		const all = [...auditBrandIdentity(site, profile), ...auditStructuredData(site, profile)];
		const scores = scoreFindings(all);
		expect(scores.find((s) => s.category === "brand_identity")?.score).toBeGreaterThan(50);
		expect(brandCompleteness(all)).toBeGreaterThan(50);
	});
});
