import { DATAFORSEO_COUNTRY_CODES, dataForSeoLocation, type GeoTarget } from "@workspace/or-core/geo";
import * as client from "dataforseo-client";
import { createDfsLabsApi, createDfsSerpApi, isDataforseoConfigured } from "../providers/registry/dataforseo-shared";

/** Keyword research and rank checks. DataForSEO is paid per request; the fixture provider is simulated. */
export interface KeywordIdea {
	keyword: string;
	searchVolume: number | null;
	difficulty: number | null;
}

export interface RankResult {
	keyword: string;
	/** Absolute organic position of the client's domain, or null when not in the checked depth. */
	position: number | null;
	url: string | null;
	topDomains: string[];
}

export interface KeywordProvider {
	id: string;
	method: "serp_via_vendor" | "fixture";
	isConfigured(): boolean;
	keywordIdeas(seeds: string[], location: GeoTarget, limit?: number): Promise<KeywordIdea[]>;
	rankCheck(keyword: string, location: GeoTarget, domain: string): Promise<RankResult>;
}

interface LabsItem {
	keyword?: string;
	keyword_info?: { search_volume?: number | null };
	keyword_properties?: { keyword_difficulty?: number | null };
}

interface SerpItem {
	type?: string;
	rank_absolute?: number;
	url?: string;
	domain?: string;
}

const firstResult = <T>(response: unknown): T | undefined =>
	(response as { tasks?: { result?: T[] }[] } | null)?.tasks?.[0]?.result?.[0];

const sameDomain = (a: string, b: string) => {
	const x = a.toLowerCase().replace(/^www\./, "");
	const y = b.toLowerCase().replace(/^www\./, "");
	return x === y || x.endsWith(`.${y}`);
};

export const dataforseoKeywords: KeywordProvider = {
	id: "dataforseo",
	method: "serp_via_vendor",
	isConfigured: isDataforseoConfigured,

	async keywordIdeas(seeds, location, limit = 50) {
		// DataForSEO Labs keyword data is country-level, so a city target uses its country's code.
		const code = DATAFORSEO_COUNTRY_CODES[location.country];
		if (code === undefined) throw new Error(`No DataForSEO location code for ${location.country}`);
		const response = await createDfsLabsApi().googleKeywordIdeasLive([
			new client.DataforseoLabsGoogleKeywordIdeasLiveRequestInfo({
				keywords: seeds,
				location_code: code,
				language_code: "en",
				limit,
			}),
		]);
		const items = firstResult<{ items?: LabsItem[] }>(response)?.items ?? [];
		return items.flatMap((i) =>
			i.keyword
				? [
						{
							keyword: i.keyword,
							searchVolume: i.keyword_info?.search_volume ?? null,
							difficulty: i.keyword_properties?.keyword_difficulty ?? null,
						},
					]
				: [],
		);
	},

	async rankCheck(keyword, location, domain) {
		const response = await createDfsSerpApi().googleOrganicLiveAdvanced([
			new client.SerpGoogleOrganicLiveAdvancedRequestInfo({
				keyword,
				...dataForSeoLocation(location),
				language_code: "en",
				depth: 30,
			}),
		]);
		const organic = (firstResult<{ items?: SerpItem[] }>(response)?.items ?? []).filter((i) => i.type === "organic");
		const hit = organic.find((i) => i.domain && sameDomain(i.domain, domain));
		return {
			keyword,
			position: hit?.rank_absolute ?? null,
			url: hit?.url ?? null,
			topDomains: organic.slice(0, 10).flatMap((i) => (i.domain ? [i.domain] : [])),
		};
	},
};

function unit(seed: string): number {
	let h = 2166136261;
	for (const ch of seed) h = Math.imul(h ^ (ch.codePointAt(0) as number), 16777619);
	return ((h >>> 0) % 10_000) / 10_000;
}

/** SIMULATED keyword data for local development and demos. */
export const fixtureKeywords: KeywordProvider = {
	id: "fixture",
	method: "fixture",
	isConfigured: () => true,
	async keywordIdeas(seeds, location) {
		const city = location.city ?? "";
		return seeds.flatMap((seed) =>
			[seed, `${seed} ${city}`.trim(), `${seed} cost`, `emergency ${seed}`].map((keyword) => ({
				keyword: keyword.toLowerCase(),
				searchVolume: Math.round(unit(keyword) * 900) + 10,
				difficulty: Math.round(unit(`${keyword}|kd`) * 60) + 5,
			})),
		);
	},
	async rankCheck(keyword, _location, domain) {
		const r = unit(`${keyword}|${domain}`);
		return {
			keyword,
			position: r < 0.6 ? Math.ceil(r * 25) : null,
			url: r < 0.6 ? `https://${domain}/` : null,
			topDomains: [],
		};
	},
};
