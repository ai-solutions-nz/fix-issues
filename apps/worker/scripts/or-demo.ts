/**
 * Online Reset local demonstration (FICTIONAL business, SIMULATED answers).
 *
 *   pnpm -C apps/worker or:demo -- --org default
 *
 * Creates "Kōwhai Plumbing & Gas" (Christchurch) with three fictional
 * competitors and 30 buyer questions, then runs the real pipeline: the
 * worker's processPromptJob collects answers through the fixture provider
 * (stored as collection_method=fixture), deriveRuns extracts text, citations
 * and mentions, the audit engine crawls locally served demo sites, the
 * opportunity engine prioritises, and one opportunity goes through draft,
 * QA, client approval, publishing to a local mock WordPress, verification,
 * retest and change measurement. Writes demo-output/report.html.
 * No paid service is called and nothing leaves this machine.
 */

import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { serviceDb } from "@workspace/lib/db/db";
import { brands, competitors, organization, promptRuns, prompts } from "@workspace/lib/db/schema";
import { orBrandProfiles } from "@workspace/lib/db/schema-or";
import { withTenant } from "@workspace/lib/db/tenant";
import { refreshOpportunities, runBrandAudit } from "@workspace/lib/or/audit-service";
import { createCmsConnection } from "@workspace/lib/or/connections";
import { dashboardData } from "@workspace/lib/or/dashboard";
import * as demo from "@workspace/lib/or/demo/christchurch";
import { startMockWordpress } from "@workspace/lib/or/demo/mock-wordpress";
import { serveSites } from "@workspace/lib/or/demo/sites-server";
import * as opt from "@workspace/lib/or/optimisation";
import { renderClientReport } from "@workspace/lib/or/report";
import { seedBuyerQuestions } from "@workspace/lib/or/visibility-service";
import { PROCESS_PROMPT_QUEUE } from "@workspace/lib/queues/prompt-jobs";
import { eq, inArray } from "drizzle-orm";
import { getBoss } from "../src/boss";
import { DERIVE_RUNS_QUEUE, DERIVE_RUNS_QUEUE_OPTIONS, deriveRuns } from "../src/jobs/derive-runs";
import { processPromptJob, runPromptNow } from "../src/jobs/process-prompt";

const OUT = path.resolve(process.cwd(), "../../demo-output");
mkdirSync(OUT, { recursive: true });
const FIXTURE_FILE = path.join(OUT, "fixture-answers.json");
process.env.OR_FIXTURE_ANSWERS_FILE = FIXTURE_FILE;
process.env.SCRAPE_TARGETS =
	"chatgpt:fixture:online,claude:fixture:online,gemini:fixture:online,perplexity:fixture:online";
process.env.TYPESAFE_API_KEY ??= "deterministic";
process.env.ELMO_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
process.env.DISABLE_TELEMETRY = "1";

const orgArg = process.argv.indexOf("--org");
const ORG_ID = orgArg > 0 ? (process.argv[orgArg + 1] as string) : "default";
const BRAND_ID = "demo-kowhai-plumbing";

type Sites = Awaited<ReturnType<typeof serveSites>>;
type Wordpress = Awaited<ReturnType<typeof startMockWordpress>>;
const noopBoss = { insert: async () => {}, send: async () => null } as never;
const scope = { organizationId: ORG_ID };

async function setupBusiness(sites: Sites) {
	console.log(`1. Business and competitors (FICTIONAL) in organization "${ORG_ID}"`);
	await serviceDb
		.insert(organization)
		.values({ id: ORG_ID, name: "Demo Agency", slug: ORG_ID, createdAt: new Date() })
		.onConflictDoNothing();
	await serviceDb
		.insert(brands)
		.values({
			id: BRAND_ID,
			name: demo.DEMO_BUSINESS.name,
			aliases: [...demo.DEMO_BUSINESS.aliases],
			website: sites.origins.client as string,
			organizationId: ORG_ID,
			onboarded: true,
		})
		.onConflictDoNothing();
	await serviceDb
		.update(brands)
		.set({ website: sites.origins.client as string, onboarded: true })
		.where(eq(brands.id, BRAND_ID));
	await serviceDb
		.insert(orBrandProfiles)
		.values({
			brandId: BRAND_ID,
			phone: demo.DEMO_BUSINESS.phone,
			streetAddress: demo.DEMO_BUSINESS.streetAddress,
			city: "Christchurch",
			region: "Canterbury",
			postcode: demo.DEMO_BUSINESS.postcode,
			openingHours: demo.DEMO_BUSINESS.openingHours,
			services: [...demo.DEMO_BUSINESS.services],
			serviceAreas: [...demo.DEMO_BUSINESS.serviceAreas],
		})
		.onConflictDoNothing();
	const existingRivals = await serviceDb.select().from(competitors).where(eq(competitors.brandId, BRAND_ID));
	if (existingRivals.length === 0) {
		await serviceDb.insert(competitors).values(
			demo.DEMO_COMPETITORS.map((c, i) => ({
				brandId: BRAND_ID,
				name: c.name,
				domains: [sites.origins[`c${i}`] as string],
			})),
		);
	} else {
		for (const [i, c] of demo.DEMO_COMPETITORS.entries())
			await serviceDb
				.update(competitors)
				.set({ domains: [sites.origins[`c${i}`] as string] })
				.where(eq(competitors.name, c.name));
	}
}

async function collect() {
	console.log("2. Buyer questions: generate, validate, de-duplicate (no model call)");
	const seeded = await withTenant({ organizationId: ORG_ID }, (tx) =>
		seedBuyerQuestions(tx, BRAND_ID, demo.DEMO_CONTEXT, 30),
	);
	const questionRows = await serviceDb.select().from(prompts).where(eq(prompts.brandId, BRAND_ID));
	console.log(
		`   ${seeded.created} new, ${questionRows.length} tracked, ${seeded.rejected.length} rejected, ${seeded.mergedDuplicates} near-duplicates merged`,
	);

	console.log(
		"3. Automated collection through the worker (fixture provider — SIMULATED answers, Christchurch location requested)",
	);
	writeFileSync(FIXTURE_FILE, JSON.stringify(demo.demoFixtureAnswers(questionRows.map((q) => q.value)), null, 2));
	await processPromptJob(
		questionRows.map((q) => ({ id: `demo-${q.id}`, name: PROCESS_PROMPT_QUEUE, data: { promptId: q.id } }) as never),
	);
	const runs = await serviceDb.select({ id: promptRuns.id }).from(promptRuns).where(eq(promptRuns.brandId, BRAND_ID));
	for (let i = 0; i < runs.length; i += 50)
		await deriveRuns({ brandId: BRAND_ID, runIds: runs.slice(i, i + 50).map((r) => r.id) }, serviceDb, noopBoss);
	console.log(`   ${runs.length} runs stored and derived`);
	return questionRows;
}

async function auditAndPrioritise() {
	console.log("4. Website, brand and competitor audit (real crawl of local demo sites)");
	const audit = await withTenant({ organizationId: ORG_ID }, (tx) =>
		runBrandAudit(tx, BRAND_ID, { allowPrivateNetwork: true, delayMs: 0 }),
	);
	console.log(
		`   ${(audit.findings as unknown[]).length} findings, brand completeness ${audit.brandCompleteness}%, agent readiness ${audit.agentReadiness}`,
	);

	console.log("5. Opportunities");
	const ops = await withTenant({ organizationId: ORG_ID }, (tx) => refreshOpportunities(tx, BRAND_ID));
	for (const o of ops.slice(0, 5)) console.log(`   [${o.priority}] ${o.title}`);
	return ops;
}

async function optimise(
	ops: Awaited<ReturnType<typeof refreshOpportunities>>,
	questionRows: Awaited<ReturnType<typeof collect>>,
	wp: Wordpress,
) {
	console.log(
		"6. Optimisation: draft → QA → revise → client approval → publish (mock WordPress) → verify → retest → measure",
	);
	const staff = { userId: "demo-staff", role: "member" };
	const client = { userId: "demo-client", role: "client" };
	const target =
		ops.find((o) => o.type === "content_gap" && o.title.includes("Hot water")) ??
		ops.find((o) => o.type === "content_gap");
	if (!target) throw new Error("No content opportunity found");
	const item = await withTenant(scope, (tx) => opt.startFromOpportunity(tx, BRAND_ID, target.id, staff));
	console.log(`   draft "${item.title}" — QA ${item.status}`);
	const answered = item.markdown.replaceAll(
		"[REVIEWER: answer from the business's own knowledge before approving.]",
		"Yes. We replace electric, gas and heat-pump hot water cylinders across Christchurch and give a written quote first.",
	);
	const revised = await withTenant(scope, (tx) => opt.reviseContent(tx, item.id, { markdown: answered }, staff));
	const approval = await withTenant(scope, (tx) => opt.requestApproval(tx, item.id, staff));
	await withTenant({ ...scope, brandIds: [BRAND_ID] }, (tx) =>
		opt.decideApproval(tx, approval.id, "approved", client, "Approved for the website"),
	);
	const connectionId = await withTenant(scope, (tx) =>
		createCmsConnection(tx, {
			brandId: BRAND_ID,
			kind: "wordpress",
			label: "Demo WordPress (local mock)",
			baseUrl: wp.url,
			username: "demo-editor",
			secret: "demo app password",
			publishStatus: "publish",
		}),
	);
	const pub = await withTenant(scope, (tx) => opt.publishContent(tx, item.id, connectionId, staff));
	const verified = await withTenant(scope, (tx) => opt.verifyPublication(tx, pub.id));
	console.log(`   v${revised?.version} published to ${pub.remoteUrl} — ${verified.status}`);
	const retest = await withTenant(scope, (tx) => opt.requestRetest(tx, pub.id, async () => {}));
	const retestPrompts = await serviceDb
		.select()
		.from(prompts)
		.where(inArray(prompts.id, retest.promptIds.length ? retest.promptIds : ["00000000-0000-0000-0000-000000000000"]));
	// SIMULATED post-publication answers for the retested questions, so the measurement step has data to compare.
	const answers = demo.demoFixtureAnswers(questionRows.map((q) => q.value)).answers;
	for (const engine of Object.keys(answers)) {
		for (const q of retestPrompts) {
			answers[engine]![q.value] = {
				text: `SIMULATED ANSWER (${engine}, after publication). For "${q.value}":\n\n1. ${demo.DEMO_BUSINESS.name} — has a dedicated page for this.\n2. Southern Pipes Plumbing.`,
				citations: [{ url: `${pub.remoteUrl}`, title: "Hot water cylinder replacement" }],
			};
		}
	}
	writeFileSync(FIXTURE_FILE, JSON.stringify({ answers }, null, 2));
	const beforeIds = new Set(
		(await serviceDb.select({ id: promptRuns.id }).from(promptRuns).where(eq(promptRuns.brandId, BRAND_ID))).map(
			(r) => r.id,
		),
	);
	for (const q of retestPrompts) await runPromptNow(q.id);
	const newRuns = (
		await serviceDb.select({ id: promptRuns.id }).from(promptRuns).where(eq(promptRuns.brandId, BRAND_ID))
	).filter((r) => !beforeIds.has(r.id));
	if (newRuns.length) await deriveRuns({ brandId: BRAND_ID, runIds: newRuns.map((r) => r.id) }, serviceDb, noopBoss);
	console.log(`   retest: ${retestPrompts.length} question(s), ${newRuns.length} new run(s)`);
	const measured = await withTenant(scope, (tx) => opt.measureChange(tx, pub.id));
	for (const m of measured)
		console.log(
			`   ${m.method}: ${m.before.rate}% of ${m.before.runs} → ${m.after.rate}% of ${m.after.runs}. ${m.interpretation}`,
		);
}

async function writeReport() {
	console.log("7. Client report");
	const data = await withTenant(scope, (tx) => dashboardData(tx, BRAND_ID));
	writeFileSync(path.join(OUT, "report.html"), renderClientReport(data, { agencyName: "Demo Agency (fictional)" }));
	writeFileSync(path.join(OUT, "dashboard.json"), JSON.stringify(data, null, 2));
	console.log(`   wrote ${path.join(OUT, "report.html")}`);
}

async function main() {
	const sites = await serveSites({
		client: demo.demoClientSite(),
		c0: demo.demoCompetitorSite(0),
		c1: demo.demoCompetitorSite(1),
		c2: demo.demoCompetitorSite(2),
	});
	const wp = await startMockWordpress({ username: "demo-editor", appPassword: "demo app password" });
	const boss = getBoss();
	await boss.start();
	await boss.createQueue(PROCESS_PROMPT_QUEUE);
	await boss.createQueue(DERIVE_RUNS_QUEUE, DERIVE_RUNS_QUEUE_OPTIONS);

	try {
		await setupBusiness(sites);
		const questionRows = await collect();
		const ops = await auditAndPrioritise();
		await optimise(ops, questionRows, wp);
		await writeReport();
	} finally {
		await boss.stop({ graceful: false }).catch(() => {});
		await sites.close();
		await wp.close();
		await serviceDb.$client.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
