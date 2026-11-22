/**
 * AI Solutions NZ: Perplexity through its own Sonar API (chat completions).
 * Field names follow the official @perplexity-ai/perplexity_ai SDK's types
 * (0.43.1): POST https://api.perplexity.ai/chat/completions with a Bearer key,
 * `web_search_options.user_location` ({ country, region, city, latitude,
 * longitude }), `disable_search`, and the response's `citations` (URLs) and
 * `search_results` ({ title, url, date, snippet }).
 *
 * Location: sent natively as `user_location`, recorded as `native`. Perplexity
 * returns no search queries, so runs record them as unavailable. The SDK lists
 * no model ids; `sonar` is the default and a target can pin another (e.g.
 * `perplexity:perplexity-api:sonar-pro:online`). Not yet called live.
 */
import type { GeoTarget } from "@workspace/or-core/geo";
import { getCredential } from "../../secrets";
import { API_PROVIDER_MAX_OUTPUT_TOKENS, configuredWhen, reportedWebQueries, warnIfOutputCapped } from "../config";
import type { Provider, ProviderOptions, ScrapeResult } from "../types";
import { responseError } from "./scrape-shared";

const PERPLEXITY_BASE_URL = "https://api.perplexity.ai";
export const PERPLEXITY_DEFAULT_MODEL = "sonar";

/** Perplexity's `web_search_options.user_location`: ISO alpha-2 country plus region and city names. */
export function perplexityUserLocation(geo: GeoTarget) {
	return {
		country: geo.country,
		...(geo.region ? { region: geo.region } : {}),
		...(geo.city ? { city: geo.city } : {}),
	};
}

async function perplexityChat(body: object): Promise<any> {
	const res = await fetch(`${PERPLEXITY_BASE_URL}/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${getCredential("PERPLEXITY_API_KEY") ?? ""}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`Perplexity API error: ${await responseError(res)}`);
	return res.json();
}

export const perplexityApi: Provider = {
	id: "perplexity-api",
	name: "Perplexity API",
	access: "api",
	docsAnchor: "direct-model-apis",

	isConfigured: configuredWhen("PERPLEXITY_API_KEY"),

	async run(_model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const version = options?.version ?? PERPLEXITY_DEFAULT_MODEL;
		const webSearch = Boolean(options?.webSearch);
		const location = webSearch && options?.location ? options.location : undefined;
		const data = await perplexityChat({
			model: version,
			messages: [{ role: "user", content: prompt }],
			max_tokens: API_PROVIDER_MAX_OUTPUT_TOKENS["perplexity-api"],
			...(webSearch ? {} : { disable_search: true }),
			...(location ? { web_search_options: { user_location: perplexityUserLocation(location) } } : {}),
		});
		warnIfOutputCapped("perplexity-api", version, data?.choices?.[0]?.finish_reason);
		const sources =
			(Array.isArray(data?.search_results) ? data.search_results.length : 0) +
			(Array.isArray(data?.citations) ? data.citations.length : 0);
		return {
			rawOutput: data,
			webQueries: reportedWebQueries([], { webSearch, searchProven: sources > 0 }),
			modelVersion: data?.model ?? version,
			locationApplied: location ? "native" : "none",
		};
	},
};
