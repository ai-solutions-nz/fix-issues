import { nzTarget } from "@workspace/or-core/geo";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractRun } from "../../text-extraction";
import { API_PROVIDER_MAX_OUTPUT_TOKENS } from "../config";
import { GEMINI_DEFAULT_MODEL, geminiApi } from "./gemini-api";

vi.mock("../../secrets", () => ({
	getCredential: (name: string) => (name === "GEMINI_API_KEY" ? "test-key" : undefined),
}));

/** A simulated generateContent response in the shape @google/genai types describe. */
const GROUNDED = {
	modelVersion: "gemini-2.5-flash-001",
	candidates: [
		{
			finishReason: "STOP",
			content: {
				role: "model",
				parts: [
					{ text: "Planning the answer…", thought: true },
					{ text: "Kōwhai Plumbing is a popular choice in Christchurch." },
				],
			},
			groundingMetadata: {
				webSearchQueries: ["best plumber christchurch"],
				groundingChunks: [
					{
						web: {
							uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc",
							title: "kowhaiplumbing.co.nz",
						},
					},
					{ web: { uri: "https://www.nzherald.co.nz/a-plumbing-story", title: "NZ Herald: plumbing" } },
				],
			},
		},
	],
};

function stubFetch(json: unknown) {
	const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => json });
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("gemini-api run", () => {
	it("calls generateContent with the key header, Google Search grounding and the output cap", async () => {
		const fetchMock = stubFetch(GROUNDED);

		await geminiApi.run("gemini", "Who is the best plumber?", { webSearch: true, version: "gemini-2.5-pro" });

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent");
		expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
		const body = JSON.parse(init.body as string);
		expect(body.tools).toEqual([{ googleSearch: {} }]);
		expect(body.generationConfig).toEqual({ maxOutputTokens: API_PROVIDER_MAX_OUTPUT_TOKENS["gemini-api"] });
	});

	it("puts the buyer's city in the question text and records it as prompt_text", async () => {
		const fetchMock = stubFetch(GROUNDED);

		const result = await geminiApi.run("gemini", "Who is the best plumber?", {
			webSearch: true,
			location: nzTarget("Christchurch"),
		});

		const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
		expect(body.contents[0].parts[0].text).toBe(
			"Who is the best plumber?\n\n(I am searching from Christchurch, Canterbury, New Zealand.)",
		);
		expect(result.locationApplied).toBe("prompt_text");
		expect(result.webQueries).toEqual(["best plumber christchurch"]);
		expect(result.modelVersion).toBe("gemini-2.5-flash-001");
	});

	it("uses the default model, no search tool and no location when none is asked for", async () => {
		const fetchMock = stubFetch({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });

		const result = await geminiApi.run("gemini", "q", { webSearch: false });

		expect(fetchMock.mock.calls[0][0]).toContain(`/models/${GEMINI_DEFAULT_MODEL}:generateContent`);
		expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).tools).toBeUndefined();
		expect(result.locationApplied).toBe("none");
		expect(result.webQueries).toEqual([]);
	});

	it("reports the API's error status", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "API key not valid" }),
		);
		await expect(geminiApi.run("gemini", "q", { webSearch: true })).rejects.toThrow(
			/Gemini API error: 403: API key not valid/,
		);
	});
});

describe("gemini-api extraction", () => {
	it("keeps the answer, drops thought summaries, and counts the real site behind a grounding redirect", () => {
		const { textContent, citations } = extractRun(GROUNDED, "gemini-api");

		expect(textContent).toBe("Kōwhai Plumbing is a popular choice in Christchurch.");
		expect(citations.map((c) => c.domain)).toEqual(["kowhaiplumbing.co.nz", "nzherald.co.nz"]);
		expect(citations[0].url).toContain("grounding-api-redirect");
	});

	it("stores no text for an empty answer rather than a placeholder", () => {
		expect(extractRun({ candidates: [{ content: { parts: [] } }] }, "gemini-api").textContent).toBeNull();
	});
});
