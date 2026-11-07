// cosineSimilarity, clusterByCosine and pickClusterRepresentative are from
// Canonry packages/contracts/src/embeddings.ts at f5d4612 (MIT, see
// THIRD_PARTY_NOTICES.md). hashEmbedding is Online Reset's own.

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
	if (a.length === 0 || b.length === 0) throw new Error("cosineSimilarity: vectors must be non-empty");
	if (a.length !== b.length) throw new Error(`cosineSimilarity: vector length mismatch (${a.length} vs ${b.length})`);
	let dot = 0;
	let magA = 0;
	let magB = 0;
	for (let i = 0; i < a.length; i++) {
		const x = a[i] as number;
		const y = b[i] as number;
		dot += x * y;
		magA += x * x;
		magB += y * y;
	}
	if (magA === 0 || magB === 0) return 0;
	return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/** Single-link clustering (union-find over pairs at or above threshold), in first-appearance order. */
export function clusterByCosine<T>(items: readonly T[], vectors: readonly number[][], threshold: number): T[][] {
	if (threshold < 0 || threshold > 1) throw new Error(`clusterByCosine: threshold must be in [0, 1], got ${threshold}`);
	if (items.length !== vectors.length) throw new Error("clusterByCosine: items/vectors length mismatch");
	const parent = items.map((_, i) => i);
	const find = (x: number): number => {
		let root = x;
		while (parent[root] !== root) root = parent[root] as number;
		let cur = x;
		while (parent[cur] !== root) {
			const next = parent[cur] as number;
			parent[cur] = root;
			cur = next;
		}
		return root;
	};
	for (let i = 0; i < items.length; i++) {
		for (let j = i + 1; j < items.length; j++) {
			if (cosineSimilarity(vectors[i] as number[], vectors[j] as number[]) >= threshold) {
				const ri = find(i);
				const rj = find(j);
				if (ri !== rj) parent[ri] = rj;
			}
		}
	}
	const byRoot = new Map<number, T[]>();
	items.forEach((item, i) => {
		const root = find(i);
		const list = byRoot.get(root);
		if (list) list.push(item);
		else byRoot.set(root, [item]);
	});
	return [...byRoot.values()];
}

/** Shortest member (less likely to over-specify intent); first wins ties. */
export function pickClusterRepresentative(cluster: readonly string[]): string {
	if (cluster.length === 0) throw new Error("pickClusterRepresentative: cluster is empty");
	return cluster.reduce((best, s) => (s.length < best.length ? s : best));
}

export const HASH_EMBEDDING_MODEL = "or-hash-trigram-v1";
const HASH_DIMENSIONS = 256;
const STOPWORDS = new Set(
	"a an the in on of for to and or is are what which who where how do does i my me can should best good near".split(
		" ",
	),
);

/**
 * A free, deterministic lexical embedding (hashed character trigrams of
 * content words). It finds rewordings ("plumber Christchurch" vs
 * "Christchurch plumbers"), not paraphrases with different words; a model
 * embedding replaces it when one is configured. Stored with its model name.
 */
export function hashEmbedding(text: string): number[] {
	const vector = new Array<number>(HASH_DIMENSIONS).fill(0);
	const words = text
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.split(/\s+/)
		.filter((w) => w && !STOPWORDS.has(w))
		.map((w) => w.replace(/s$/, ""));
	for (const word of words) {
		const padded = ` ${word} `;
		for (let i = 0; i + 3 <= padded.length; i++) {
			let h = 2166136261;
			for (const ch of padded.slice(i, i + 3)) h = Math.imul(h ^ (ch.codePointAt(0) as number), 16777619);
			const idx = (h >>> 0) % HASH_DIMENSIONS;
			vector[idx] = (vector[idx] as number) + 1;
		}
	}
	return vector;
}
