/**
 * AI Solutions NZ: Google Gemini through its own API (generateContent),
 * grounded with Google Search. Request and response field names follow the
 * official @google/genai SDK's types (3.6.1): `tools: [{ googleSearch: {} }]`,
 * `candidates[].content.parts[].text`, `candidates[].groundingMetadata`
 * (`webSearchQueries`, `groundingChunks[].web.{uri,title}`), `modelVersion`.
 *
 * Location: Gemini's only location field (`toolConfig.retrievalConfig.latLng`)
 * is not documented for Google Search grounding, so the buyer's city goes in
 * the question text and the run records `location_applied = prompt_text`
 * (Phase 2 gate). Not yet called live.
 */
import { locationPromptSuffix } from "@workspace/or-core/geo";
import { getCredential } from "../../secrets";
import { API_PROVIDER_MAX_OUTPUT_TOKENS, configuredWhen, reportedWebQueries, warnIfOutputCapped } from "../config";
import type { Provider, ProviderOptions, ScrapeResult } from "../types";
import { nonEmptyStrings, responseError } from "./scrape-shared";

/** The SDK's current default API version for the Gemini Developer API. */
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1";
export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";

async function geminiGenerate(model: string, body: object): Promise<any> {
	const res = await fetch(`${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`, {
		method: "POST",
		headers: {
			"x-goog-api-key": getCredential("GEMINI_API_KEY") ?? "",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`Gemini API error: ${await responseError(res)}`);
	return res.json();
}

export const geminiApi: Provider = {
	id: "gemini-api",
	name: "Google Gemini API",
	access: "api",
	docsAnchor: "direct-model-apis",

	isConfigured: configuredWhen("GEMINI_API_KEY"),

	async run(_model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const version = options?.version ?? GEMINI_DEFAULT_MODEL;
		const text = options?.location ? `${prompt}${locationPromptSuffix(options.location)}` : prompt;
		const data = await geminiGenerate(version, {
			contents: [{ role: "user", parts: [{ text }] }],
			generationConfig: { maxOutputTokens: API_PROVIDER_MAX_OUTPUT_TOKENS["gemini-api"] },
			...(options?.webSearch ? { tools: [{ googleSearch: {} }] } : {}),
		});
		const candidate = data?.candidates?.[0];
		warnIfOutputCapped("gemini-api", version, candidate?.finishReason === "MAX_TOKENS" ? "max_tokens" : undefined);
		const grounding = candidate?.groundingMetadata;
		const chunks = Array.isArray(grounding?.groundingChunks) ? grounding.groundingChunks : [];
		return {
			rawOutput: data,
			webQueries: reportedWebQueries(nonEmptyStrings(grounding?.webSearchQueries), {
				webSearch: Boolean(options?.webSearch),
				searchProven: chunks.length > 0,
			}),
			modelVersion: data?.modelVersion ?? version,
			locationApplied: options?.location ? "prompt_text" : "none",
		};
	},
};
