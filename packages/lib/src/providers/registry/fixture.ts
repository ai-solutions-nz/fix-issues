import { readFileSync } from "node:fs";
import type { Provider, ProviderOptions, ScrapeResult } from "../types";

/**
 * Online Reset fixture provider: SIMULATED answers for local development and
 * demos, never a live AI response. Runs it produces are stored with
 * collection_method = "fixture" and every screen labels them as simulated.
 *
 * Answers come from the JSON file named by OR_FIXTURE_ANSWERS_FILE:
 *   { "answers": { "<model>": { "<prompt>": { "text": "...", "citations": [{ "url": "...", "title": "..." }] } } } }
 * with "*" as a wildcard model. The payload uses the OpenAI Responses shape so
 * it goes through the same text and citation extraction as a real run.
 */
interface FixtureAnswer {
	text: string;
	citations?: { url: string; title?: string }[];
}

type FixtureFile = { answers: Record<string, Record<string, FixtureAnswer>> };

let cache: { path: string; data: FixtureFile } | null = null;

function loadFixtures(): FixtureFile {
	const path = process.env.OR_FIXTURE_ANSWERS_FILE;
	if (!path) return { answers: {} };
	if (cache?.path !== path) cache = { path, data: JSON.parse(readFileSync(path, "utf8")) as FixtureFile };
	return cache.data;
}

export function fixtureAnswerFor(model: string, prompt: string): FixtureAnswer {
	const { answers } = loadFixtures();
	const key = prompt.trim();
	return (
		answers[model]?.[key] ??
		answers["*"]?.[key] ?? {
			text: "SIMULATED ANSWER: no fixture is recorded for this question, so this placeholder names no business.",
			citations: [],
		}
	);
}

export const fixture: Provider = {
	id: "fixture",
	name: "Fixture (simulated, no network)",
	access: "api",

	isConfigured() {
		return true;
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const answer = fixtureAnswerFor(model, prompt);
		return {
			rawOutput: {
				or_fixture: true,
				output: [
					{
						type: "message",
						content: [
							{
								type: "output_text",
								text: answer.text,
								annotations: (answer.citations ?? []).map((c) => ({
									type: "url_citation",
									url: c.url,
									title: c.title,
								})),
							},
						],
					},
				],
			},
			webQueries: [],
			modelVersion: `fixture-${model}`,
			// A fixture cannot honour a location, so it never claims to.
			locationApplied: options?.location ? "none" : undefined,
		};
	},
};
