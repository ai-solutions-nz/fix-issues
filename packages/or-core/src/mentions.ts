// Ported from limelit-co/open internal/mentions/mentions.go and phrase.go at
// 53d178b62fc33bf23270aa4399f5f5ae4e5243bd.
// Copyright 2026 Limelit. Licensed under the Apache License, Version 2.0
// (see THIRD_PARTY_NOTICES.md). Modified for Online Reset: translated from Go
// to TypeScript; offsets are UTF-16 string indices; brand ids are strings.
//
// Mentions are found by text search, not a model call, so a figure can be
// recomputed from the stored answer and comes out the same every time. The
// cost is discovery: a brand nobody listed is invisible here.

export interface Brand {
	/** Null for the client brand itself. */
	competitorId: string | null;
	name: string;
	aliases?: string[];
	/** A citation to or prose mention of this domain counts as a mention. */
	domain?: string;
}

export interface Mention {
	competitorId: string | null;
	brandKey: string;
	brandName: string;
	start: number;
	end: number;
	/** 1-based position of the enclosing list item; null outside a list. */
	listRank: number | null;
}

/** Lowercased, letters and digits only: "Run:AI", "RunAI" and "run ai" are one key. */
export function normalizeKey(s: string): string {
	return Array.from(s.toLowerCase())
		.filter((ch) => /[\p{L}\p{N}]/u.test(ch))
		.join("");
}

interface PreparedBrand {
	competitorId: string | null;
	name: string;
	aliases: string[];
	domain: string;
}

export class Matcher {
	private readonly brands: PreparedBrand[];

	constructor(brands: Brand[]) {
		this.brands = [];
		for (const b of brands) {
			const aliases = usefulTerms([b.name, ...(b.aliases ?? [])]);
			const domain = (b.domain ?? "").trim();
			if (aliases.length === 0 && domain === "") continue;
			this.brands.push({ competitorId: b.competitorId, name: b.name, aliases, domain });
		}
	}

	/** Every mention in document order; at one position the longest match wins. */
	find(text: string): Mention[] {
		if (!text || this.brands.length === 0) return [];
		const ranks = listRanks(text);
		const found: Mention[] = [];
		for (const brand of this.brands) {
			const label = domainLabel(brand.domain);
			for (const term of searchTerms(brand)) {
				const phrase = isPhraseName(term, label);
				for (const [start, end] of findTerm(text, term)) {
					if (phrase && !standsAsName(text, start, end)) continue;
					found.push({
						competitorId: brand.competitorId,
						brandKey: normalizeKey(brand.name),
						brandName: brand.name,
						start,
						end,
						listRank: rankAt(ranks, start),
					});
				}
			}
		}
		return dedupe(found);
	}
}

function searchTerms(b: PreparedBrand): string[] {
	const terms = [...b.aliases];
	const d = b.domain.trim().toLowerCase();
	if (d) {
		terms.push(d);
		const host = d.replace(/^www\./, "");
		const label = domainLabel(host);
		if (
			(host.match(/\./g) ?? []).length === 1 &&
			Array.from(label).length >= 3 &&
			!terms.some((t) => t.toLowerCase() === label)
		) {
			terms.push(label);
		}
	}
	return terms;
}

/** Terms under three characters match inside ordinary words, so they are dropped. */
function usefulTerms(input: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of input) {
		const s = raw.trim();
		if (Array.from(s).length < 3 || seen.has(s.toLowerCase())) continue;
		seen.add(s.toLowerCase());
		out.push(s);
	}
	return out;
}

const isWordChar = (ch: string | undefined) => ch !== undefined && /[A-Za-z0-9]/.test(ch);

/** Whole-word spans: a match is real when neither neighbour is an ASCII letter or digit. */
function findTerm(text: string, term: string): [number, number][] {
	if (!term) return [];
	const lowerText = text.toLowerCase();
	const lowerTerm = term.toLowerCase();
	const spans: [number, number][] = [];
	for (let offset = 0; ; ) {
		const start = lowerText.indexOf(lowerTerm, offset);
		if (start < 0) break;
		const end = start + lowerTerm.length;
		if (!isWordChar(lowerText[start - 1]) && !isWordChar(lowerText[end])) spans.push([start, end]);
		offset = start + 1;
	}
	return spans;
}

function dedupe(input: Mention[]): Mention[] {
	const best = new Map<number, Mention>();
	for (const m of input) {
		const cur = best.get(m.start);
		if (!cur || m.end - m.start > cur.end - cur.start) best.set(m.start, m);
	}
	const out: Mention[] = [];
	let lastEnd = -1;
	for (const start of [...best.keys()].sort((a, b) => a - b)) {
		const m = best.get(start) as Mention;
		if (m.start < lastEnd) continue;
		out.push(m);
		lastEnd = m.end;
	}
	return out;
}

interface ListItem {
	start: number;
	end: number;
	rank: number;
}

const LIST_LINE = /^[ \t]*(?:(\d{1,2})[.)]|[-*•])[ \t]+/gm;

function rankAt(items: ListItem[], offset: number): number | null {
	for (const item of items) if (offset >= item.start && offset < item.end) return item.rank;
	return null;
}

function indentWidth(s: string): number {
	let n = 0;
	for (const ch of s) {
		if (ch === " ") n++;
		else if (ch === "\t") n += 4;
		else return n;
	}
	return n;
}

function isListLine(line: string): boolean {
	return /^[ \t]*(?:(\d{1,2})[.)]|[-*•])[ \t]+/.test(line);
}

/** Where a list item stops: the next item, or earlier at a blank line followed by prose. */
function itemEnd(text: string, start: number, next: number, indent: number): number {
	for (let off = start; ; ) {
		const i = text.slice(off, next).indexOf("\n\n");
		if (i < 0) return next;
		const blank = off + i;
		let line = text.slice(blank, next).replace(/^\n+/, "");
		const nl = line.indexOf("\n");
		if (nl >= 0) line = line.slice(0, nl);
		if (line.trim() !== "" && indentWidth(line) <= indent && !isListLine(line)) return blank;
		off = blank + 2;
	}
}

/** Each list item's rank, restarting at every new list; nested items belong to their parent. */
function listRanks(text: string): ListItem[] {
	const matches = [...text.matchAll(LIST_LINE)];
	if (matches.length === 0) return [];
	const items: { start: number; indent: number; rank: number }[] = [];
	let rank = 0;
	let indent = -1;
	for (const m of matches) {
		const start = m.index ?? 0;
		const ind = indentWidth(m[0]);
		const prev = items[items.length - 1];
		if (prev && itemEnd(text, prev.start, start, prev.indent) < start) {
			rank = 0;
			indent = -1;
		}
		if (indent >= 0 && ind > indent) continue;
		if (m[1] !== undefined && Number(m[1]) === 1) rank = 0;
		rank++;
		indent = ind;
		items.push({ start, indent: ind, rank });
	}
	return items.map((it, i) => ({
		start: it.start,
		end: itemEnd(
			text,
			it.start,
			i + 1 < items.length ? (items[i + 1] as { start: number }).start : text.length,
			it.indent,
		),
		rank: it.rank,
	}));
}

// --- phrase.go: a brand name that is also a description ("Kindle to PDF") counts only where it reads as a name.

const CONNECTING = new Set([
	"to",
	"for",
	"and",
	"or",
	"of",
	"in",
	"on",
	"with",
	"into",
	"from",
	"by",
	"the",
	"a",
	"an",
	"vs",
	"versus",
	"&",
]);
const TASK_BEFORE = new Set(
	"convert converts converting converted export exports exporting exported save saves saving print prints printing transfer transferring turn turning transform transforming change changing".split(
		" ",
	),
);
const GENERIC_AFTER = new Set(
	"converter converters conversion conversions tool tools software program programs utility utilities method methods guide guides tutorial tutorials process workflow workflows solution solutions".split(
		" ",
	),
);
const OPENING = new Set(
	"use using try with get choose pick install open visit download add consider and or but also then like for via see meet the a an is it its this that our your their if when while so yes no note tip best top recommended alternatively i we you".split(
		" ",
	),
);

export function isPhraseName(name: string, label: string): boolean {
	const words = name.toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length < 2 || !label) return false;
	return words.some((w) => CONNECTING.has(w)) && normalizeKey(name) === normalizeKey(label);
}

export function domainLabel(domain: string): string {
	let d = domain.trim().toLowerCase();
	const scheme = d.indexOf("://");
	if (scheme >= 0) d = d.slice(scheme + 3);
	const slash = d.indexOf("/");
	if (slash >= 0) d = d.slice(0, slash);
	d = d.replace(/^www\./, "");
	const dot = d.indexOf(".");
	return dot >= 0 ? d.slice(0, dot) : d;
}

const WORD_RUNE = /[\p{L}\p{N}]/u;

function wordBefore(text: string, at: number): string {
	let i = at;
	while (i > 0 && (text[i - 1] === " " || text[i - 1] === "\t")) i--;
	if (i === at) return "";
	const end = i;
	while (i > 0) {
		const ch = text[i - 1] as string;
		if (!WORD_RUNE.test(ch) && ch !== "'" && ch !== "’") break;
		i--;
	}
	return text.slice(i, end);
}

function wordAfter(text: string, at: number): string {
	let i = at;
	while (i < text.length && (text[i] === " " || text[i] === "\t")) i++;
	if (i === at) return "";
	const start = i;
	while (i < text.length && WORD_RUNE.test(text[i] as string)) i++;
	return text.slice(start, i);
}

function standsAsName(text: string, start: number, end: number): boolean {
	const before = wordBefore(text, start);
	if (TASK_BEFORE.has(before.toLowerCase())) return false;
	if (GENERIC_AFTER.has(wordAfter(text, end).toLowerCase())) return false;
	if (before !== "" && before !== before.toLowerCase() && !OPENING.has(before.toLowerCase())) return false;
	return true;
}

/** True when the question itself names the brand; branded questions are excluded from headline visibility. */
export function isBranded(text: string, brand: Brand): boolean {
	return new Matcher([brand]).find(text).length > 0;
}
