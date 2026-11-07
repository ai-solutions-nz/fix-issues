import { describe, expect, it } from "vitest";
import {
	contentHash,
	draftSchemaFix,
	draftServicePage,
	localBusinessJsonLd,
	markdownToHtml,
	qaDraft,
	qaPassed,
	slugify,
} from "./content";

const facts = {
	businessName: "Kōwhai Plumbing & Gas",
	phone: "03 555 0142",
	streetAddress: "48 Example Road, Addington",
	city: "Christchurch",
	region: "Canterbury",
	openingHours: "Mo-Fr 07:00-17:30",
	services: ["Hot water cylinder replacement"],
	serviceAreas: ["Riccarton", "Papanui"],
	website: "https://kowhai-plumbing.example/",
};
const brief = {
	opportunityTitle: "Missing page",
	topic: "Hot water cylinder replacement",
	questions: ["Who does hot water cylinder replacement in Christchurch?"],
	competitorsRecommended: ["Southern Pipes Plumbing"],
	citedSources: [],
	findings: [],
};

describe("content drafting", () => {
	it("drafts from profile facts only and leaves answers for the business", () => {
		const d = draftServicePage(facts, brief);
		expect(d.slug).toBe("hot-water-cylinder-replacement-christchurch");
		expect(d.markdown).toContain("Riccarton");
		expect(d.markdown).not.toContain("Southern Pipes");
		expect(d.claims.every((c) => c.source === "profile")).toBe(true);
		expect(d.html).toContain("<h1>Hot water cylinder replacement in Christchurch</h1>");
		expect(d.jsonLd?.areaServed).toEqual([
			{ "@type": "Place", name: "Christchurch" },
			{ "@type": "Place", name: "Riccarton" },
			{ "@type": "Place", name: "Papanui" },
		]);
	});

	it("blocks a draft until reviewer placeholders are answered", () => {
		const d = draftServicePage(facts, brief);
		const checks = qaDraft(d, facts);
		expect(checks.find((c) => c.id === "review.placeholders")?.ok).toBe(false);
		expect(qaPassed(checks)).toBe(false);
		const answered = {
			...d,
			markdown: d.markdown.replaceAll(
				"[REVIEWER: answer from the business's own knowledge before approving.]",
				"We replace electric and gas cylinders across Christchurch.",
			),
		};
		expect(qaPassed(qaDraft(answered, facts))).toBe(true);
	});

	it("rejects invented phone numbers, prices and unsupported claims", () => {
		const d = draftServicePage(facts, brief);
		const bad = {
			...d,
			markdown: `${d.markdown}\nCall 09 123 4567. From $199. Guaranteed cheapest in Christchurch.`.replaceAll(
				"[REVIEWER:",
				"",
			),
		};
		const failed = qaDraft(bad, facts)
			.filter((c) => !c.ok)
			.map((c) => c.id);
		expect(failed).toEqual(expect.arrayContaining(["facts.phone", "claims.prices", "claims.prohibited"]));
	});

	it("builds schema fixes from the profile and binds approvals to content", () => {
		const fix = draftSchemaFix(facts, ["areaServed missing"]);
		expect(qaPassed(qaDraft(fix, facts))).toBe(true);
		expect(localBusinessJsonLd(facts, "Plumber")["@type"]).toBe("Plumber");
		const d = draftServicePage(facts, brief);
		expect(contentHash(d)).toBe(contentHash({ ...d }));
		expect(contentHash({ ...d, title: "changed" })).not.toBe(contentHash(d));
	});

	it("escapes HTML and slugifies macrons", () => {
		expect(markdownToHtml("<script>")).toBe("<p>&lt;script&gt;</p>");
		expect(slugify("Kōwhai & Gas")).toBe("kowhai-gas");
	});
});
