// Cases ported from limelit-co/open internal/mentions/mentions_test.go and
// testdata/phrase_names.json at 53d178b (Apache-2.0).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isBranded, Matcher, normalizeKey } from "./mentions";

const acmeAndRivals = () =>
	new Matcher([
		{ competitorId: null, name: "Acme", aliases: ["Acme Inc"], domain: "acme.com" },
		{ competitorId: "1", name: "Globex", domain: "globex.com" },
		{ competitorId: "2", name: "Initech", domain: "initech.com" },
	]);

function ranksOf(text: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const m of acmeAndRivals().find(text)) out[m.brandName] = m.listRank ?? -1;
	return out;
}

describe("mention matcher (Limelit port)", () => {
	it("normalizes spellings to one key", () => {
		for (const s of ["Run:AI", "RunAI", "run ai", "  Run-AI  "]) expect(normalizeKey(s)).toBe("runai");
		expect(normalizeKey("!!!")).toBe("");
	});

	it("ranks numbered and bulleted lists, not prose", () => {
		expect(
			ranksOf(
				"Here are the leaders:\n\n1. Globex is the enterprise option.\n2. Acme is best for small teams.\n3. Initech rounds out the list.\n",
			),
		).toEqual({
			Globex: 1,
			Acme: 2,
			Initech: 3,
		});
		expect(Object.values(ranksOf("Top picks:\n\n- Globex\n- Acme\n- Initech\n")).every((r) => r > 0)).toBe(true);
		expect(ranksOf("Acme and Globex both do this well, though Initech is cheaper.")).toEqual({
			Acme: -1,
			Globex: -1,
			Initech: -1,
		});
	});

	it("handles list boundaries the way Markdown reads them", () => {
		expect(ranksOf("Top picks:\n\n1. Globex\n2. Initech\n\nAcme is also worth a look.")).toEqual({
			Globex: 1,
			Initech: 2,
			Acme: -1,
		});
		expect(ranksOf("1. Globex\n\n   It connects to Acme out of the box.\n2. Initech\n")).toEqual({
			Globex: 1,
			Acme: 1,
			Initech: 2,
		});
		expect(ranksOf("1. Acme\n   - fast\n   - integrates with Initech\n2. Globex\n")).toEqual({
			Acme: 1,
			Initech: 1,
			Globex: 2,
		});
		expect(ranksOf("Enterprise:\n\n- Globex\n\nFor small teams:\n\n  - Acme\n  - Initech\n")).toEqual({
			Globex: 1,
			Acme: 1,
			Initech: 2,
		});
		expect(
			ranksOf(
				"Enterprise:\n\n1. Globex\n2. Initech\n\nThat is the enterprise end. For small teams the picture is different:\n\n1. Acme\n",
			).Acme,
		).toBe(1);
	});

	it("points offsets at the matched text and keeps every occurrence", () => {
		const text = "The leader is Globex today.";
		const [m] = acmeAndRivals().find(text);
		expect(text.slice(m?.start, m?.end)).toBe("Globex");
		expect(acmeAndRivals().find("Acme leads. Later, Acme again. And Acme once more.")).toHaveLength(3);
		expect(acmeAndRivals().find("I could not find any information about Acme.")).toHaveLength(1);
	});

	it("matches domains and respects word boundaries", () => {
		expect(
			acmeAndRivals()
				.find("See acme.com for pricing.")
				.map((m) => m.brandName),
		).toEqual(["Acme"]);
		expect(acmeAndRivals().find("Acmeify and Globexity are unrelated products. So is initechnology.")).toEqual([]);
		expect(acmeAndRivals().find("Try Acme, Globex; or acme.com.")).toHaveLength(3);
	});

	it("prefers the longest brand and keeps same-name brands apart by domain", () => {
		const longest = new Matcher([
			{ competitorId: null, name: "Acme", domain: "acme.com" },
			{ competitorId: "1", name: "Acme Analytics", domain: "acmeanalytics.com" },
		]).find("Acme Analytics is the leader.");
		expect(longest.map((m) => m.brandName)).toEqual(["Acme Analytics"]);
		const split = new Matcher([
			{ competitorId: null, name: "Acme", domain: "acme.com" },
			{ competitorId: "1", name: "Acme Cloud", domain: "acme.io" },
		]).find("Look at acme.io rather than acme.com.");
		expect(new Set(split.map((m) => m.brandName))).toEqual(new Set(["Acme", "Acme Cloud"]));
	});

	it("ignores unsafe short names and empty inputs", () => {
		const go = new Matcher([{ competitorId: null, name: "Go", domain: "golang.org" }]);
		expect(go.find("I am going to the good category.")).toEqual([]);
		expect(go.find("See golang.org.")).toHaveLength(1);
		expect(
			new Matcher([
				{ competitorId: null, name: "", domain: "" },
				{ competitorId: null, name: "Acme", domain: "acme.com" },
			]).find("Acme leads."),
		).toHaveLength(1);
		expect(acmeAndRivals().find("")).toEqual([]);
		expect(new Matcher([]).find("Acme leads.")).toEqual([]);
	});

	it("is deterministic", () => {
		const text = "1. Globex\n2. Acme\n3. Initech\n\nAcme also appears here.";
		const first = JSON.stringify(acmeAndRivals().find(text));
		for (let i = 0; i < 20; i++) expect(JSON.stringify(acmeAndRivals().find(text))).toBe(first);
	});

	it("detects branded questions", () => {
		const acme = { competitorId: null, name: "Acme", aliases: ["Acme Inc"], domain: "acme.com" };
		for (const t of ["What is Acme?", "is acme.com any good", "Acme Inc vs Globex"])
			expect(isBranded(t, acme)).toBe(true);
		for (const t of ["best CRM tools", "Globex alternatives"]) expect(isBranded(t, acme)).toBe(false);
	});

	const phrase = JSON.parse(readFileSync(new URL("./testdata/limelit-phrase-names.json", import.meta.url), "utf8")) as {
		cases: { name: string; domain: string; found: boolean; why: string; text: string }[];
	};
	it.each(phrase.cases)("phrase-name rule: $why", (c) => {
		const found = new Matcher([{ competitorId: null, name: c.name, domain: c.domain }]).find(c.text).length > 0;
		expect(found).toBe(c.found);
	});
});
