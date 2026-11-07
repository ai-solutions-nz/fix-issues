import { describe, expect, it } from "vitest";
import { clusterByCosine, cosineSimilarity, hashEmbedding, pickClusterRepresentative } from "./clustering";

describe("clustering (Canonry port)", () => {
	it("computes cosine similarity safely", () => {
		expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
		expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
		expect(() => cosineSimilarity([1], [1, 2])).toThrow();
	});

	it("chains single-link clusters in first-appearance order", () => {
		const clusters = clusterByCosine(
			["a", "b", "c", "d"],
			[
				[1, 0],
				[0.99, 0.14],
				[0.95, 0.31],
				[0, 1],
			],
			0.97,
		);
		expect(clusters).toEqual([["a", "b", "c"], ["d"]]);
		expect(pickClusterRepresentative(["longest one", "short", "tiny"])).toBe("tiny");
	});

	it("groups rewordings with the free lexical embedding and is deterministic", () => {
		const a = hashEmbedding("Best plumber in Christchurch");
		const b = hashEmbedding("best plumbers Christchurch");
		const c = hashEmbedding("How much does a roof repair cost?");
		expect(cosineSimilarity(a, b)).toBeGreaterThan(0.85);
		expect(cosineSimilarity(a, c)).toBeLessThan(0.4);
		expect(hashEmbedding("Best plumber in Christchurch")).toEqual(a);
	});
});
