import { clusterByCosine, hashEmbedding, pickClusterRepresentative } from "./clustering";
import { isBranded } from "./mentions";

/**
 * Buyer questions for local service businesses. Deterministic templates (no
 * model call, no spend), one per intent shape, after Limelit's prompt-pack
 * approach (internal/promptpack, Apache-2.0): rewordings of one question
 * measure one thing many times, so each template is a different intent.
 */
export type QuestionIntent = "discovery" | "urgent" | "price" | "trust" | "comparison" | "local" | "service" | "brand";

export interface BusinessContext {
	brand: string;
	brandDomain?: string;
	/** What a buyer calls this kind of business, singular: "plumber", "electrician". */
	trade: string;
	services: string[];
	city: string;
	suburbs?: string[];
	competitors: string[];
}

export interface BuyerQuestion {
	text: string;
	intent: QuestionIntent;
	branded: boolean;
}

const plural = (w: string) =>
	/(s|sh|ch|x)$/.test(w) ? `${w}es` : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`;

export function generateBuyerQuestions(ctx: BusinessContext): BuyerQuestion[] {
	const t = ctx.trade.trim().toLowerCase();
	const ts = plural(t);
	const city = ctx.city.trim();
	const out: BuyerQuestion[] = [];
	const add = (text: string, intent: QuestionIntent) => {
		const clean = text.replace(/\s+/g, " ").trim();
		out.push({
			text: clean,
			intent,
			branded: isBranded(clean, { competitorId: null, name: ctx.brand, domain: ctx.brandDomain }),
		});
	};
	add(`Who is the best ${t} in ${city}?`, "discovery");
	add(`Can you recommend a reliable ${t} in ${city}?`, "discovery");
	add(`What are the top-rated ${ts} in ${city}?`, "discovery");
	add(`I need a ${t} in ${city} this week. Who should I call?`, "discovery");
	add(`Emergency ${t} in ${city} available after hours`, "urgent");
	add(`Who can I call for an urgent ${t} job in ${city} today?`, "urgent");
	add(`How much does a ${t} cost in ${city}?`, "price");
	add(`What is a fair hourly rate for a ${t} in ${city}?`, "price");
	add(`Which ${ts} in ${city} give free quotes?`, "price");
	add(`How do I find a trustworthy ${t} in ${city}?`, "trust");
	add(`Which ${ts} in ${city} have the best reviews?`, "trust");
	add(`What should I check before hiring a ${t} in New Zealand?`, "trust");
	for (const service of ctx.services.slice(0, 6)) {
		add(`Who does ${service.toLowerCase()} in ${city}?`, "service");
		add(`Best company for ${service.toLowerCase()} in ${city}`, "service");
	}
	for (const suburb of (ctx.suburbs ?? []).slice(0, 4)) add(`${t} near ${suburb}, ${city}`, "local");
	for (const competitor of ctx.competitors.slice(0, 3))
		add(`Is ${competitor} a good ${t} in ${city}? What are the alternatives?`, "comparison");
	add(`What is ${ctx.brand} like as a ${t} in ${city}?`, "brand");
	add(`Is ${ctx.brand} reliable?`, "brand");
	return out;
}

export interface QuestionValidation {
	status: "accepted" | "rejected";
	reasons: string[];
}

/**
 * Rules a tracked question must pass. Rejections are kept with reasons so the
 * set can be reviewed rather than silently pruned.
 */
export function validateQuestion(q: BuyerQuestion, ctx: BusinessContext): QuestionValidation {
	const reasons: string[] = [];
	const text = q.text.toLowerCase();
	const words = text.split(/\s+/).filter(Boolean);
	if (words.length < 3) reasons.push("too short to be a buyer question");
	if (words.length > 40) reasons.push("too long for a typical buyer question");
	const terms = [ctx.trade, plural(ctx.trade), ...ctx.services].map((s) => s.toLowerCase());
	const relevant = terms.some((s) => text.includes(s)) || q.intent === "brand" || q.intent === "comparison";
	if (!relevant) reasons.push("does not mention the trade or a service the business offers");
	const localIntent = q.intent !== "brand" && q.intent !== "trust";
	const mentionsPlace = [ctx.city, ...(ctx.suburbs ?? []), "new zealand", "nz"].some((p) =>
		text.includes(p.toLowerCase()),
	);
	if (localIntent && !mentionsPlace) reasons.push("local question without a location");
	return { status: reasons.length === 0 ? "accepted" : "rejected", reasons };
}

export interface QuestionCluster {
	representative: string;
	members: string[];
}

/** Near-duplicate grouping with the free lexical embedding; pass model vectors to use a semantic model instead. */
export function clusterQuestions(
	texts: readonly string[],
	options: { threshold?: number; vectors?: number[][] } = {},
): QuestionCluster[] {
	const vectors = options.vectors ?? texts.map(hashEmbedding);
	return clusterByCosine(texts, vectors, options.threshold ?? 0.85).map((members) => ({
		representative: pickClusterRepresentative(members),
		members,
	}));
}
