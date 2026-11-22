import { nzTarget } from "@workspace/or-core/geo";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WEB_QUERIES_UNAVAILABLE } from "../../constants";
import { extractRun } from "../../text-extraction";
import { API_PROVIDER_MAX_OUTPUT_TOKENS } from "../config";
import { PERPLEXITY_DEFAULT_MODEL, perplexityApi, perplexityUserLocation } from "./perplexity-api";

vi.mock("../../secrets", () => ({
	getCredential: (name: string) => (name === "PERPLEXITY_API_KEY" ? "test-key" : undefined),
}));

/** A simulated chat completion in the shape the @perplexity-ai/perplexity_ai types describe. */
const ANSWER = {
	id: "r1",
	model: "sonar",
	created: 0,
	choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "Try Kōwhai Plumbing [1]." } }],
	citations: ["https://kowhaiplumbing.co.nz/", "https://www.nzherald.co.nz/story"],
	search_results: [
		{ title: "Kōwhai Plumbing", url: "https://kowhaiplumbing.co.nz/", date: "2026-10-01" },
		{ title: "NZ Herald", url: "https://www.nzherald.co.nz/story" },
	],
};

function stubFetch(json: unknown) {
	const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => json });
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>) {
	return JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
}

afterEach(() => vi.unstubAllGlobals());

describe("perplexity-api run", () => {
	it("calls chat completions with a Bearer key, the output cap and the buyer's city as user_location", async () => {
		const fetchMock = stubFetch(ANSWER);

		const result = await perplexityApi.run("perplexity", "Who is the best plumber?", {
			webSearch: true,
			location: nzTarget("Christchurch"),
		});

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.perplexity.ai/chat/completions");
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
		const body = sentBody(fetchMock);
		expect(body.model).toBe(PERPLEXITY_DEFAULT_MODEL);
		expect(body.max_tokens).toBe(API_PROVIDER_MAX_OUTPUT_TOKENS["perplexity-api"]);
		expect(body.web_search_options).toEqual({
			user_location: { country: "NZ", region: "Canterbury", city: "Christchurch" },
		});
		expect(body.messages).toEqual([{ role: "user", content: "Who is the best plumber?" }]);
		expect(body.disable_search).toBeUndefined();
		expect(result.locationApplied).toBe("native");
		// Perplexity returns no queries; with sources present they are recorded as withheld.
		expect(result.webQueries).toEqual([WEB_QUERIES_UNAVAILABLE]);
	});

	it("turns search off, and sends no location, when web search is not asked for", async () => {
		const fetchMock = stubFetch(ANSWER);

		const result = await perplexityApi.run("perplexity", "q", {
			webSearch: false,
			version: "sonar-pro",
			location: nzTarget("Auckland"),
		});

		const body = sentBody(fetchMock);
		expect(body.model).toBe("sonar-pro");
		expect(body.disable_search).toBe(true);
		expect(body.web_search_options).toBeUndefined();
		expect(result.locationApplied).toBe("none");
		expect(result.webQueries).toEqual([]);
	});

	it("reports the API's error status", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "Unauthorized" }));
		await expect(perplexityApi.run("perplexity", "q", { webSearch: true })).rejects.toThrow(
			/Perplexity API error: 401: Unauthorized/,
		);
	});

	it("builds user_location without empty fields", () => {
		expect(perplexityUserLocation({ country: "NZ" })).toEqual({ country: "NZ" });
	});
});

describe("perplexity-api extraction", () => {
	it("reads the answer and cites search_results with their titles", () => {
		const { textContent, citations } = extractRun(ANSWER, "perplexity-api");

		expect(textContent).toBe("Try Kōwhai Plumbing [1].");
		expect(citations.map((c) => [c.domain, c.title])).toEqual([
			["kowhaiplumbing.co.nz", "Kōwhai Plumbing"],
			["nzherald.co.nz", "NZ Herald"],
		]);
	});

	it("falls back to the bare citations list", () => {
		const { citations } = extractRun({ ...ANSWER, search_results: undefined }, "perplexity-api");
		expect(citations.map((c) => c.url)).toEqual(["https://kowhaiplumbing.co.nz/", "https://www.nzherald.co.nz/story"]);
	});
});
