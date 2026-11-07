import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractRun } from "../../text-extraction";
import { fixture } from "./fixture";

describe("fixture provider", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("serves recorded answers through the real extraction path, marked as fixture", async () => {
		const dir = mkdtempSync(path.join(tmpdir(), "or-fixture-"));
		const file = path.join(dir, "answers.json");
		writeFileSync(
			file,
			JSON.stringify({
				answers: {
					"*": {
						"best plumber": {
							text: "Try Southern Pipes.",
							citations: [{ url: "https://nocowboys.example/a", title: "Reviews" }],
						},
					},
				},
			}),
		);
		vi.stubEnv("OR_FIXTURE_ANSWERS_FILE", file);
		const result = await fixture.run("gpt", "best plumber", { location: { country: "NZ", city: "Christchurch" } });
		expect((result.rawOutput as { or_fixture: boolean }).or_fixture).toBe(true);
		expect(result.locationApplied).toBe("none");
		const extracted = extractRun(result.rawOutput, "fixture");
		expect(extracted.textContent).toBe("Try Southern Pipes.");
		expect(extracted.citations.map((c) => c.url)).toEqual(["https://nocowboys.example/a"]);
	});

	it("answers an unrecorded question with a labelled placeholder that names no business", async () => {
		vi.stubEnv("OR_FIXTURE_ANSWERS_FILE", "");
		const result = await fixture.run("gpt", "anything");
		expect(extractRun(result.rawOutput, "fixture").textContent).toMatch(/^SIMULATED ANSWER/);
	});
});
