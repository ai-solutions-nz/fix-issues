/**
 * New Zealand location targeting. The request shapes follow Canonry's
 * grounded providers (packages/provider-openai and provider-claude
 * normalize.ts at f5d4612, MIT): the location is sent as the search tool's
 * `user_location`. Engines without such a parameter get the location in the
 * prompt text, and the run records which of the two happened.
 */
export interface GeoTarget {
	/** ISO 3166-1 alpha-2. */
	country: string;
	region?: string;
	city?: string;
	timezone?: string;
}

export type LocationApplied = "native" | "prompt_text" | "none";

export interface NzCity {
	city: string;
	region: string;
}

/** Major NZ urban areas and their regions. Timezone is Pacific/Auckland throughout (Chatham Islands excepted). */
export const NZ_CITIES: readonly NzCity[] = [
	{ city: "Auckland", region: "Auckland" },
	{ city: "Wellington", region: "Wellington" },
	{ city: "Christchurch", region: "Canterbury" },
	{ city: "Hamilton", region: "Waikato" },
	{ city: "Tauranga", region: "Bay of Plenty" },
	{ city: "Dunedin", region: "Otago" },
	{ city: "Palmerston North", region: "Manawatū-Whanganui" },
	{ city: "Napier", region: "Hawke's Bay" },
	{ city: "Hastings", region: "Hawke's Bay" },
	{ city: "Nelson", region: "Nelson" },
	{ city: "Rotorua", region: "Bay of Plenty" },
	{ city: "New Plymouth", region: "Taranaki" },
	{ city: "Whangārei", region: "Northland" },
	{ city: "Invercargill", region: "Southland" },
	{ city: "Queenstown", region: "Otago" },
];

export const NZ_TIMEZONE = "Pacific/Auckland";

/** DataForSEO's location code for New Zealand (verified in Limelit and SerpBear source). City codes are not hard-coded. */
export const DATAFORSEO_COUNTRY_CODES: Record<string, number> = { NZ: 2554, AU: 2036, US: 2840, GB: 2826 };

export function nzTarget(city: string): GeoTarget {
	const match = NZ_CITIES.find((c) => c.city.toLowerCase() === city.trim().toLowerCase());
	if (!match) throw new Error(`Unknown New Zealand city: ${city}`);
	return { country: "NZ", region: match.region, city: match.city, timezone: NZ_TIMEZONE };
}

export function describeLocation(geo: GeoTarget): string {
	const country = geo.country === "NZ" ? "New Zealand" : geo.country;
	return [geo.city, geo.region, country].filter(Boolean).join(", ");
}

/** OpenAI Responses API `web_search` tool `user_location`. */
export function openAiUserLocation(geo: GeoTarget) {
	return {
		type: "approximate" as const,
		country: geo.country,
		region: geo.region,
		city: geo.city,
		...(geo.timezone ? { timezone: geo.timezone } : {}),
	};
}

/** Anthropic Messages API `web_search_20250305` tool `user_location` (same approximate shape). */
export const anthropicUserLocation = openAiUserLocation;

/** For engines with no location parameter: appended to the question, as Canonry does for Gemini. */
export function locationPromptSuffix(geo: GeoTarget): string {
	return `\n\n(I am searching from ${describeLocation(geo)}.)`;
}

/**
 * DataForSEO SERP/AI-mode location fields. A city is sent by name (DataForSEO
 * accepts `location_name`); whether DataForSEO resolves a given NZ city name
 * is only confirmed by a live call, so the country code is the fallback.
 */
export function dataForSeoLocation(geo: GeoTarget): { location_code?: number; location_name?: string } {
	if (geo.city)
		return {
			location_name: [geo.city, geo.region, geo.country === "NZ" ? "New Zealand" : geo.country]
				.filter(Boolean)
				.join(","),
		};
	const code = DATAFORSEO_COUNTRY_CODES[geo.country];
	if (code === undefined) throw new Error(`No DataForSEO location code for ${geo.country}`);
	return { location_code: code };
}
