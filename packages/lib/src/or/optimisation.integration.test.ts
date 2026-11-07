import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { serviceDb } from "../db/db";
import { insertRuns } from "../db/runs";
import { brands, organization, prompts } from "../db/schema";
import {
	orApprovals,
	orAuditLog,
	orBrandProfiles,
	orCmsConnections,
	orContentItems,
	orOpportunities,
	orPublications,
} from "../db/schema-or";
import { withTenant } from "../db/tenant";
import { createCmsConnection } from "./connections";
import { type MockWordpress, startMockWordpress } from "./demo/mock-wordpress";
import {
	decideApproval,
	measureChange,
	publishContent,
	requestApproval,
	requestRetest,
	reviseContent,
	rollbackPublication,
	startFromOpportunity,
	verifyPublication,
} from "./optimisation";

const ORG = "or-opt-org";
const BRAND = "or-opt-brand";
const OPP = "opp-hot-water";
const staff = { userId: "staff-1", role: "member" };
const client = { userId: "client-1", role: "client" };
let wp: MockWordpress;
let connectionId: string;
let promptId: string;
let itemId: string;
let publicationId: string;
const scope = { organizationId: ORG };

async function cleanup() {
	await serviceDb.execute(sql`ALTER TABLE or_audit_log DISABLE TRIGGER or_audit_log_append_only`);
	await serviceDb.delete(orAuditLog).where(eq(orAuditLog.organizationId, ORG));
	await serviceDb.execute(sql`ALTER TABLE or_audit_log ENABLE TRIGGER or_audit_log_append_only`);
	await serviceDb.delete(orPublications).where(eq(orPublications.brandId, BRAND));
	await serviceDb.delete(orApprovals).where(eq(orApprovals.brandId, BRAND));
	await serviceDb.delete(orContentItems).where(eq(orContentItems.brandId, BRAND));
	await serviceDb.delete(orCmsConnections).where(eq(orCmsConnections.brandId, BRAND));
	await serviceDb.delete(orOpportunities).where(eq(orOpportunities.brandId, BRAND));
	await serviceDb.execute(sql`DELETE FROM prompt_runs WHERE brand_id = ${BRAND}`);
	await serviceDb.delete(prompts).where(eq(prompts.brandId, BRAND));
	await serviceDb.delete(orBrandProfiles).where(eq(orBrandProfiles.brandId, BRAND));
	await serviceDb.delete(brands).where(eq(brands.id, BRAND));
	await serviceDb.delete(organization).where(eq(organization.id, ORG));
}

beforeAll(async () => {
	vi.stubEnv("ELMO_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
	await cleanup();
	wp = await startMockWordpress({ username: "editor", appPassword: "abcd efgh ijkl mnop" });
	await serviceDb
		.insert(organization)
		.values({ id: ORG, name: "Opt Agency", slug: "or-opt-agency", createdAt: new Date() });
	await serviceDb.insert(brands).values({
		id: BRAND,
		name: "Kōwhai Plumbing & Gas",
		website: "https://kowhai-plumbing.example/",
		organizationId: ORG,
	});
	await serviceDb.insert(orBrandProfiles).values({
		brandId: BRAND,
		phone: "03 555 0142",
		city: "Christchurch",
		region: "Canterbury",
		services: ["Hot water cylinder replacement"],
		serviceAreas: ["Riccarton"],
	});
	const [p] = await serviceDb
		.insert(prompts)
		.values({ brandId: BRAND, value: "Who does hot water cylinder replacement in Christchurch?" })
		.returning();
	promptId = p!.id;
	await insertRuns(serviceDb, [
		{
			promptId,
			brandId: BRAND,
			model: "chatgpt",
			provider: "fixture",
			version: "1",
			webSearchEnabled: true,
			rawOutput: {},
			collectionMethod: "fixture",
			textContent: "1. Southern Pipes Plumbing",
			createdAt: new Date(Date.now() - 86_400_000),
		},
	]);
	await serviceDb.insert(orOpportunities).values({
		brandId: BRAND,
		opportunityId: OPP,
		type: "content_gap",
		title: 'Missing page: "Hot water cylinder replacement"',
		rationale: "No page covers it.",
		recommendedAction: "Publish a page.",
		priority: 50,
		components: {},
		evidence: {
			runIds: [],
			findingIds: ["intent.service:hot water cylinder replacement"],
			sources: [],
			promptIds: [promptId],
		},
		collectionMethod: "fixture",
	});
	connectionId = await withTenant(scope, (tx) =>
		createCmsConnection(tx, {
			brandId: BRAND,
			kind: "wordpress",
			label: "Client WP",
			baseUrl: wp.url,
			username: "editor",
			secret: "abcd efgh ijkl mnop",
			publishStatus: "publish",
		}),
	);
});

afterAll(async () => {
	await wp?.close();
	await cleanup();
	vi.unstubAllEnvs();
});

describe("optimisation workflow (end to end, mock WordPress)", () => {
	it("stores the CMS credential encrypted, never in plain text", async () => {
		const [row] = await serviceDb.select().from(orCmsConnections).where(eq(orCmsConnections.id, connectionId));
		expect(row?.encryptedSecret).not.toContain("abcd");
	});

	it("does not let a client create content", async () => {
		await expect(withTenant(scope, (tx) => startFromOpportunity(tx, BRAND, OPP, client))).rejects.toThrow(/Forbidden/);
	});

	it("researches and drafts from evidence, and QA blocks unanswered placeholders", async () => {
		const item = await withTenant(scope, (tx) => startFromOpportunity(tx, BRAND, OPP, staff));
		itemId = item.id;
		expect(item.status).toBe("qa_failed");
		expect(item.slug).toBe("hot-water-cylinder-replacement-christchurch");
		await expect(withTenant(scope, (tx) => requestApproval(tx, itemId, staff))).rejects.toThrow(/must pass QA/);
		await expect(withTenant(scope, (tx) => publishContent(tx, itemId, connectionId, staff))).rejects.toThrow(
			/no approval/,
		);
	});

	it("re-checks a revision, then the client approves it", async () => {
		const [item] = await serviceDb.select().from(orContentItems).where(eq(orContentItems.id, itemId));
		const answered = item!.markdown.replaceAll(
			"[REVIEWER: answer from the business's own knowledge before approving.]",
			"We replace electric and gas hot water cylinders across Christchurch, usually within a day.",
		);
		const revised = await withTenant(scope, (tx) => reviseContent(tx, itemId, { markdown: answered }, staff));
		expect(revised?.status).toBe("ready_for_approval");
		expect(revised?.version).toBe(2);
		const approval = await withTenant(scope, (tx) => requestApproval(tx, itemId, staff));
		const decided = await withTenant({ ...scope, brandIds: [BRAND] }, (tx) =>
			decideApproval(tx, approval.id, "approved", client, "Looks right"),
		);
		expect(decided.status).toBe("approved");
		expect(decided.decidedRole).toBe("client");
	});

	it("refuses, in the database, a publication whose content differs from what was approved", async () => {
		const [approval] = await serviceDb
			.select()
			.from(orApprovals)
			.where(and(eq(orApprovals.contentItemId, itemId), eq(orApprovals.status, "approved")));
		const forged = serviceDb.insert(orPublications).values({
			brandId: BRAND,
			contentItemId: itemId,
			approvalId: approval!.id,
			contentHash: "tampered",
			idempotencyKey: "forged",
		});
		await expect(forged).rejects.toSatisfy((e: Error & { cause?: Error }) =>
			/does not match what was approved/.test(e.cause?.message ?? e.message),
		);
	});

	it("publishes once even when retried, then verifies the live page", async () => {
		const first = await withTenant(scope, (tx) => publishContent(tx, itemId, connectionId, staff));
		const again = await withTenant(scope, (tx) => publishContent(tx, itemId, connectionId, staff));
		publicationId = first.id;
		expect(again.id).toBe(first.id);
		expect(first.status).toBe("published");
		expect(wp.requests.filter((r) => r.method === "POST" && r.path === "/wp-json/wp/v2/pages")).toHaveLength(1);
		expect([...wp.pages.values()][0]?.status).toBe("publish");
		const verified = await withTenant(scope, (tx) => verifyPublication(tx, publicationId));
		expect(verified.status).toBe("verified");
		expect(verified.verification).toMatchObject({
			reachable: true,
			headlinePresent: true,
			structuredDataPresent: true,
		});
	});

	it("retests the related questions and reports the change without claiming cause", async () => {
		const enqueued: string[][] = [];
		await withTenant(scope, (tx) => requestRetest(tx, publicationId, async (ids) => void enqueued.push(ids)));
		expect(enqueued).toEqual([[promptId]]);
		await insertRuns(serviceDb, [
			{
				promptId,
				brandId: BRAND,
				model: "chatgpt",
				provider: "fixture",
				version: "1",
				webSearchEnabled: true,
				rawOutput: {},
				collectionMethod: "fixture",
				textContent: "1. Kōwhai Plumbing & Gas\n2. Southern Pipes Plumbing",
				createdAt: new Date(Date.now() + 60_000),
			},
		]);
		const [m] = await withTenant(scope, (tx) => measureChange(tx, publicationId));
		expect(m).toMatchObject({
			method: "fixture",
			before: { runs: 1, mentioned: 0, rate: 0 },
			after: { runs: 1, mentioned: 1, rate: 100 },
		});
		expect(m?.interpretation).toMatch(/not proof/);
	});

	it("rolls back and keeps a complete audit trail", async () => {
		const rolled = await withTenant(scope, (tx) => rollbackPublication(tx, publicationId, staff));
		expect(rolled.status).toBe("rolled_back");
		expect([...wp.pages.values()][0]?.status).toBe("draft");
		const actions = (
			await serviceDb.select({ action: orAuditLog.action }).from(orAuditLog).where(eq(orAuditLog.organizationId, ORG))
		).map((a) => a.action);
		expect(actions).toEqual([
			"content.drafted",
			"content.revised",
			"approval.requested",
			"approval.approved",
			"content.published",
			"content.rolled_back",
		]);
	});
});
