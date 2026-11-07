/**
 * Online Reset measurement rules. Every stored run carries how it was
 * collected, and no metric ever combines different collection methods:
 * a model API's answer is not what a person sees in the consumer app.
 */
export const METHODOLOGY_VERSION = "or-m1";

export const COLLECTION_METHODS = [
	"model_api_grounded",
	"model_api_ungrounded",
	"consumer_surface_via_vendor",
	"serp_via_vendor",
	"manual_capture",
	"fixture",
	"unknown",
] as const;
export type CollectionMethod = (typeof COLLECTION_METHODS)[number];

/** Methods whose results came from a real engine, collected automatically. */
export const LIVE_AUTOMATED_METHODS: readonly CollectionMethod[] = [
	"model_api_grounded",
	"model_api_ungrounded",
	"consumer_surface_via_vendor",
	"serp_via_vendor",
];

export const METHOD_LABELS: Record<CollectionMethod, string> = {
	model_api_grounded: "Model API with web search",
	model_api_ungrounded: "Model API without web search",
	consumer_surface_via_vendor: "Consumer AI interface (via data vendor)",
	serp_via_vendor: "Search results (via data vendor)",
	manual_capture: "Manual capture",
	fixture: "SIMULATED — fixture data, not a live AI response",
	unknown: "Unknown method (legacy run)",
};

export function isSimulated(method: CollectionMethod): boolean {
	return method === "fixture";
}

/**
 * Derives the method from what the provider is and how it was called. A
 * provider id of "stub" or "fixture" is always simulated, whatever it claims.
 */
export function deriveCollectionMethod(input: {
	providerId: string;
	access: "api" | "scraped";
	webSearch: boolean;
}): CollectionMethod {
	if (input.providerId === "stub" || input.providerId === "fixture") return "fixture";
	if (input.access === "scraped") return "consumer_surface_via_vendor";
	return input.webSearch ? "model_api_grounded" : "model_api_ungrounded";
}

export class MixedMethodError extends Error {
	constructor(methods: string[]) {
		super(`Refusing to aggregate runs collected by different methods: ${methods.join(", ")}`);
	}
}

/** Throws unless every row shares one collection method; returns that method. */
export function requireSingleMethod<T extends { collectionMethod: CollectionMethod }>(
	rows: readonly T[],
): CollectionMethod | null {
	const methods = [...new Set(rows.map((r) => r.collectionMethod))];
	if (methods.length > 1) throw new MixedMethodError(methods);
	return methods[0] ?? null;
}

export function groupByMethod<T extends { collectionMethod: CollectionMethod }>(
	rows: readonly T[],
): Map<CollectionMethod, T[]> {
	const out = new Map<CollectionMethod, T[]>();
	for (const row of rows) {
		const list = out.get(row.collectionMethod);
		if (list) list.push(row);
		else out.set(row.collectionMethod, [row]);
	}
	return out;
}

/** `part / whole` as a 0–100 percentage, or null when there is nothing to divide by (a share of nothing is not 0%). */
export function percentOf(part: number, whole: number): number | null {
	if (!(whole > 0)) return null;
	return Math.round((part / whole) * 100 * 10) / 10;
}
