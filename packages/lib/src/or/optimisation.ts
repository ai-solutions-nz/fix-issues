import {
	type ContentFacts,
	contentHash,
	type Draft,
	draftSchemaFix,
	draftServicePage,
	markdownToHtml,
	qaDraft,
	qaPassed,
	type ResearchBrief,
} from "@workspace/or-core/content";
import { and, desc, eq, inArray } from "drizzle-orm";
import { clientRole, memberRole, ownerRole } from "../auth/permissions";
import type { DbConnection } from "../db/db-connection";
import { brands, prompts } from "../db/schema";
import { orApprovals, orBrandProfiles, orContentItems, orOpportunities, orPublications } from "../db/schema-or";
import { recordAudit } from "./audit";
import { publishTargetFor } from "./connections";
import { loadAnalysedRuns } from "./visibility-service";

/**
 * The approval-gated optimisation workflow:
 *   opportunity → research → draft → QA → approval → publish → verify → retest → measure.
 * Every step is recorded in the audit log. Publishing needs an approval of the
 * exact current content (also enforced by a database trigger) and is
 * idempotent per approved version.
 */
export interface Actor {
	userId: string;
	/** Organization role: owner, admin, member or client. */
	role: string;
}

const ROLES = { owner: ownerRole, admin: ownerRole, member: memberRole, client: clientRole } as const;

function can(actor: Actor, permission: Record<string, string[]>): boolean {
	const role = ROLES[actor.role as keyof typeof ROLES];
	return !!role && role.authorize(permission as never).success;
}

function requirePermission(actor: Actor, permission: Record<string, string[]>, what: string): void {
	if (!can(actor, permission)) throw new Error(`Forbidden: role "${actor.role}" cannot ${what}`);
}

async function brandContext(conn: DbConnection, brandId: string) {
	const [brand] = await conn.select().from(brands).where(eq(brands.id, brandId)).limit(1);
	if (!brand) throw new Error(`Brand not found: ${brandId}`);
	const [profile] = await conn.select().from(orBrandProfiles).where(eq(orBrandProfiles.brandId, brandId)).limit(1);
	const facts: ContentFacts = {
		businessName: brand.name,
		phone: profile?.phone,
		email: profile?.email,
		streetAddress: profile?.streetAddress,
		city: profile?.city ?? "",
		region: profile?.region,
		postcode: profile?.postcode,
		openingHours: profile?.openingHours,
		services: profile?.services ?? [],
		serviceAreas: profile?.serviceAreas ?? [],
		website: brand.website,
		sameAs: profile?.sameAs ?? [],
	};
	return { brand, facts };
}

function topicFor(opportunityTitle: string, questions: string[], services: string[]): string {
	const hay = `${opportunityTitle} ${questions.join(" ")}`.toLowerCase();
	return (
		services.find((s) => hay.includes(s.toLowerCase())) ??
		opportunityTitle.replace(/^Missing page:\s*/, "").replace(/^"|"$/g, "")
	);
}

/** Steps 1–4: turn an opportunity into a researched, QA-checked draft. */
export async function startFromOpportunity(conn: DbConnection, brandId: string, opportunityId: string, actor: Actor) {
	requirePermission(actor, { content: ["create"] }, "create content");
	const [opp] = await conn
		.select()
		.from(orOpportunities)
		.where(and(eq(orOpportunities.brandId, brandId), eq(orOpportunities.opportunityId, opportunityId)))
		.limit(1);
	if (!opp) throw new Error("Opportunity not found");
	const { brand, facts } = await brandContext(conn, brandId);
	const promptIds = opp.evidence.promptIds;
	const questions = promptIds.length
		? (await conn.select({ value: prompts.value }).from(prompts).where(inArray(prompts.id, promptIds))).map(
				(p) => p.value,
			)
		: [];
	const runs = opp.evidence.runIds.length
		? (await loadAnalysedRuns(conn, brandId)).filter((r) => opp.evidence.runIds.includes(r.runId))
		: [];
	const brief: ResearchBrief = {
		opportunityTitle: opp.title,
		topic: topicFor(opp.title, questions, facts.services),
		questions,
		competitorsRecommended: [...new Set(runs.flatMap((r) => r.competitorsRecommended))],
		citedSources: [...new Set([...runs.flatMap((r) => r.citations.map((c) => c.domain)), ...opp.evidence.sources])],
		findings: opp.evidence.findingIds,
	};
	const draft: Draft =
		opp.type === "technical_fix" && opp.evidence.findingIds.some((f) => f.startsWith("schema."))
			? draftSchemaFix(facts, [opp.rationale])
			: draftServicePage(facts, brief);
	const qa = qaDraft(draft, facts);
	const [item] = await conn
		.insert(orContentItems)
		.values({
			brandId,
			opportunityId,
			kind: draft.kind,
			title: draft.title,
			slug: draft.slug,
			metaDescription: draft.metaDescription,
			markdown: draft.markdown,
			html: draft.html,
			jsonLd: draft.jsonLd,
			claims: draft.claims,
			research: { ...brief, evidence: opp.evidence, collectionMethod: opp.collectionMethod },
			qa,
			status: qaPassed(qa) ? "ready_for_approval" : "qa_failed",
			contentHash: contentHash(draft),
			createdBy: actor.userId,
		})
		.returning();
	if (!item) throw new Error("Could not create content item");
	await conn
		.update(orOpportunities)
		.set({ status: "in_progress" })
		.where(and(eq(orOpportunities.brandId, brandId), eq(orOpportunities.opportunityId, opportunityId)));
	await recordAudit(conn, {
		organizationId: brand.organizationId,
		brandId,
		actorType: "user",
		actorId: actor.userId,
		action: "content.drafted",
		subjectType: "content_item",
		subjectId: item.id,
		details: { opportunityId, qaPassed: qaPassed(qa) },
	});
	return item;
}

/** Edit a draft. A new version supersedes any pending approval and is re-checked. */
export async function reviseContent(
	conn: DbConnection,
	itemId: string,
	changes: { title?: string; metaDescription?: string; markdown?: string },
	actor: Actor,
) {
	requirePermission(actor, { content: ["update"] }, "edit content");
	const [item] = await conn.select().from(orContentItems).where(eq(orContentItems.id, itemId)).limit(1);
	if (!item) throw new Error("Content item not found");
	if (item.status === "published" || item.status === "verified")
		throw new Error("Published content cannot be edited; start a new revision from the opportunity");
	const { brand, facts } = await brandContext(conn, item.brandId);
	const markdown = changes.markdown ?? item.markdown;
	const draft: Draft = {
		kind: item.kind,
		title: changes.title ?? item.title,
		slug: item.slug,
		metaDescription: changes.metaDescription ?? item.metaDescription,
		markdown,
		html: item.kind === "service_page" ? markdownToHtml(markdown) : item.html,
		jsonLd: item.jsonLd,
		claims: item.claims as Draft["claims"],
	};
	const qa = qaDraft(draft, facts);
	await conn
		.update(orApprovals)
		.set({ status: "superseded" })
		.where(and(eq(orApprovals.contentItemId, itemId), eq(orApprovals.status, "pending")));
	const [updated] = await conn
		.update(orContentItems)
		.set({
			title: draft.title,
			metaDescription: draft.metaDescription,
			markdown: draft.markdown,
			html: draft.html,
			qa,
			version: item.version + 1,
			contentHash: contentHash(draft),
			status: qaPassed(qa) ? "ready_for_approval" : "qa_failed",
		})
		.where(eq(orContentItems.id, itemId))
		.returning();
	await recordAudit(conn, {
		organizationId: brand.organizationId,
		brandId: item.brandId,
		actorType: "user",
		actorId: actor.userId,
		action: "content.revised",
		subjectType: "content_item",
		subjectId: itemId,
		details: { version: item.version + 1 },
	});
	return updated;
}

/** Step 5: ask for approval of the exact current content. */
export async function requestApproval(conn: DbConnection, itemId: string, actor: Actor) {
	requirePermission(actor, { content: ["update"] }, "request approval");
	const [item] = await conn.select().from(orContentItems).where(eq(orContentItems.id, itemId)).limit(1);
	if (!item) throw new Error("Content item not found");
	if (item.status !== "ready_for_approval")
		throw new Error(`Content must pass QA before approval (status: ${item.status})`);
	const [brand] = await conn.select().from(brands).where(eq(brands.id, item.brandId)).limit(1);
	const [approval] = await conn
		.insert(orApprovals)
		.values({
			brandId: item.brandId,
			contentItemId: itemId,
			contentVersion: item.version,
			contentHash: item.contentHash,
			requestedBy: actor.userId,
		})
		.returning();
	await conn.update(orContentItems).set({ status: "pending_approval" }).where(eq(orContentItems.id, itemId));
	await recordAudit(conn, {
		organizationId: brand!.organizationId,
		brandId: item.brandId,
		actorType: "user",
		actorId: actor.userId,
		action: "approval.requested",
		subjectType: "approval",
		subjectId: approval!.id,
	});
	return approval!;
}

/** Step 5 (decision): agency staff or the client approves or rejects. */
export async function decideApproval(
	conn: DbConnection,
	approvalId: string,
	decision: "approved" | "rejected",
	actor: Actor,
	comment?: string,
) {
	requirePermission(actor, { approval: ["decide"] }, "decide approvals");
	const [approval] = await conn.select().from(orApprovals).where(eq(orApprovals.id, approvalId)).limit(1);
	if (!approval) throw new Error("Approval not found");
	if (approval.status !== "pending") throw new Error(`Approval is already ${approval.status}`);
	const [item] = await conn.select().from(orContentItems).where(eq(orContentItems.id, approval.contentItemId)).limit(1);
	if (!item || item.contentHash !== approval.contentHash)
		throw new Error("Content changed after approval was requested; request approval again");
	const [brand] = await conn.select().from(brands).where(eq(brands.id, approval.brandId)).limit(1);
	const [decided] = await conn
		.update(orApprovals)
		.set({
			status: decision,
			decidedBy: actor.userId,
			decidedRole: actor.role,
			comment: comment ?? null,
			decidedAt: new Date(),
		})
		.where(and(eq(orApprovals.id, approvalId), eq(orApprovals.status, "pending")))
		.returning();
	if (!decided) throw new Error("Approval was decided concurrently");
	await conn.update(orContentItems).set({ status: decision }).where(eq(orContentItems.id, item.id));
	await recordAudit(conn, {
		organizationId: brand!.organizationId,
		brandId: approval.brandId,
		actorType: "user",
		actorId: actor.userId,
		action: `approval.${decision}`,
		subjectType: "approval",
		subjectId: approvalId,
		details: { role: actor.role, comment },
	});
	return decided;
}

/** Step 6: publish approved content once. Retries and concurrent calls return the same publication. */
export async function publishContent(
	conn: DbConnection,
	itemId: string,
	connectionId: string,
	actor: Actor,
	options: { fetchImpl?: typeof fetch } = {},
) {
	requirePermission(actor, { content: ["publish"] }, "publish content");
	const [item] = await conn.select().from(orContentItems).where(eq(orContentItems.id, itemId)).limit(1);
	if (!item) throw new Error("Content item not found");
	const [approval] = await conn
		.select()
		.from(orApprovals)
		.where(
			and(
				eq(orApprovals.contentItemId, itemId),
				eq(orApprovals.status, "approved"),
				eq(orApprovals.contentHash, item.contentHash),
			),
		)
		.orderBy(desc(orApprovals.decidedAt))
		.limit(1);
	if (!approval) throw new Error("Not authorised: this exact content has no approval");
	const idempotencyKey = `${itemId}:${item.version}:${item.contentHash}`;
	const [existing] = await conn
		.select()
		.from(orPublications)
		.where(eq(orPublications.idempotencyKey, idempotencyKey))
		.limit(1);
	if (existing) return existing;
	const [claimed] = await conn
		.insert(orPublications)
		.values({
			brandId: item.brandId,
			contentItemId: itemId,
			approvalId: approval.id,
			contentHash: item.contentHash,
			connectionId,
			idempotencyKey,
		})
		.onConflictDoNothing({ target: orPublications.idempotencyKey })
		.returning();
	if (!claimed)
		return (await conn.select().from(orPublications).where(eq(orPublications.idempotencyKey, idempotencyKey)))[0]!;
	const [brand] = await conn.select().from(brands).where(eq(brands.id, item.brandId)).limit(1);
	try {
		const target = await publishTargetFor(conn, connectionId, options.fetchImpl);
		const result = await target.publish({
			title: item.title,
			slug: item.slug,
			html: item.html,
			metaDescription: item.metaDescription,
			jsonLd: item.jsonLd,
		});
		const [done] = await conn
			.update(orPublications)
			.set({
				status: "published",
				remoteId: result.remoteId,
				remoteUrl: result.url,
				snapshot: result.snapshot,
				publishedAt: new Date(),
			})
			.where(eq(orPublications.id, claimed.id))
			.returning();
		await conn.update(orContentItems).set({ status: "published" }).where(eq(orContentItems.id, itemId));
		await recordAudit(conn, {
			organizationId: brand!.organizationId,
			brandId: item.brandId,
			actorType: "user",
			actorId: actor.userId,
			action: "content.published",
			subjectType: "publication",
			subjectId: claimed.id,
			details: { url: result.url, approvalId: approval.id },
		});
		return done!;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await conn
			.update(orPublications)
			.set({ status: "failed", error: message })
			.where(eq(orPublications.id, claimed.id));
		await recordAudit(conn, {
			organizationId: brand!.organizationId,
			brandId: item.brandId,
			actorType: "system",
			action: "content.publish_failed",
			subjectType: "publication",
			subjectId: claimed.id,
			details: { error: message },
		});
		throw error;
	}
}

/** Step 7: fetch the live page and confirm the approved content is what the public sees. */
export async function verifyPublication(conn: DbConnection, publicationId: string, fetchImpl: typeof fetch = fetch) {
	const [pub] = await conn.select().from(orPublications).where(eq(orPublications.id, publicationId)).limit(1);
	if (!pub?.remoteUrl) throw new Error("Publication has no URL to verify");
	const [item] = await conn.select().from(orContentItems).where(eq(orContentItems.id, pub.contentItemId)).limit(1);
	const res = await fetchImpl(pub.remoteUrl, { signal: AbortSignal.timeout(20_000) });
	const html = await res.text();
	const headline =
		item?.markdown
			.split("\n")
			.find((l) => l.startsWith("# "))
			?.slice(2) ??
		item?.title ??
		"";
	const checks = {
		status: res.status,
		reachable: res.ok,
		headlinePresent: headline ? html.includes(headline.replace(/&/g, "&amp;")) || html.includes(headline) : false,
		structuredDataPresent: item?.jsonLd ? html.includes("application/ld+json") : true,
		checkedAt: new Date().toISOString(),
	};
	const ok = checks.reachable && checks.headlinePresent && checks.structuredDataPresent;
	const [done] = await conn
		.update(orPublications)
		.set({ status: ok ? "verified" : "verification_failed", verification: checks })
		.where(eq(orPublications.id, publicationId))
		.returning();
	if (ok && item) await conn.update(orContentItems).set({ status: "verified" }).where(eq(orContentItems.id, item.id));
	return done!;
}

/** Step 8: re-run the related buyer questions now, recording the baseline to compare against. */
export async function requestRetest(
	conn: DbConnection,
	publicationId: string,
	enqueue: (promptIds: string[]) => Promise<void>,
) {
	const [pub] = await conn.select().from(orPublications).where(eq(orPublications.id, publicationId)).limit(1);
	if (!pub) throw new Error("Publication not found");
	const [item] = await conn.select().from(orContentItems).where(eq(orContentItems.id, pub.contentItemId)).limit(1);
	const promptIds = ((item?.research as { evidence?: { promptIds?: string[] } })?.evidence?.promptIds ??
		[]) as string[];
	if (promptIds.length) await enqueue(promptIds);
	const retest = { requestedAt: new Date().toISOString(), promptIds };
	await conn.update(orPublications).set({ retest }).where(eq(orPublications.id, publicationId));
	return retest;
}

export interface ChangeMeasurement {
	method: string;
	promptIds: string[];
	before: { runs: number; mentioned: number; rate: number | null };
	after: { runs: number; mentioned: number; rate: number | null };
	/** Always states that a change is observed, not proven to be caused by the publication. */
	interpretation: string;
}

/** Step 9: compare visibility for the related questions before and after publication, per collection method. */
export async function measureChange(conn: DbConnection, publicationId: string): Promise<ChangeMeasurement[]> {
	const [pub] = await conn.select().from(orPublications).where(eq(orPublications.id, publicationId)).limit(1);
	if (!pub?.publishedAt) throw new Error("Publication has not been published");
	const [item] = await conn.select().from(orContentItems).where(eq(orContentItems.id, pub.contentItemId)).limit(1);
	const promptIds = ((item?.research as { evidence?: { promptIds?: string[] } })?.evidence?.promptIds ??
		[]) as string[];
	const runs = (await loadAnalysedRuns(conn, pub.brandId)).filter((r) => promptIds.includes(r.promptId) && !r.branded);
	const methods = [...new Set(runs.map((r) => r.collectionMethod))];
	const rate = (m: number, n: number) => (n ? Math.round((m / n) * 1000) / 10 : null);
	const measurements = methods.map((method) => {
		const mine = runs.filter((r) => r.collectionMethod === method);
		const before = mine.filter((r) => r.createdAt < (pub.publishedAt as Date));
		const after = mine.filter((r) => r.createdAt >= (pub.publishedAt as Date));
		const b = { runs: before.length, mentioned: before.filter((r) => r.brandMentioned).length };
		const a = { runs: after.length, mentioned: after.filter((r) => r.brandMentioned).length };
		return {
			method,
			promptIds,
			before: { ...b, rate: rate(b.mentioned, b.runs) },
			after: { ...a, rate: rate(a.mentioned, a.runs) },
			interpretation:
				a.runs === 0
					? "No runs since publication yet; nothing to compare."
					: "Observed change in mention rate for these questions since publication. This is an association, not proof that the publication caused it.",
		};
	});
	await conn
		.update(orPublications)
		.set({ retest: { ...(pub.retest ?? {}), measuredAt: new Date().toISOString(), measurements } })
		.where(eq(orPublications.id, publicationId));
	return measurements;
}

/** Undo a publication: restore what the CMS held before, or take a new page out of public view. */
export async function rollbackPublication(
	conn: DbConnection,
	publicationId: string,
	actor: Actor,
	options: { fetchImpl?: typeof fetch } = {},
) {
	requirePermission(actor, { content: ["publish"] }, "roll back publications");
	const [pub] = await conn.select().from(orPublications).where(eq(orPublications.id, publicationId)).limit(1);
	if (!pub?.remoteId || !pub.connectionId) throw new Error("Nothing to roll back");
	const target = await publishTargetFor(conn, pub.connectionId, options.fetchImpl);
	await target.rollback({ remoteId: pub.remoteId, url: pub.remoteUrl ?? "", snapshot: pub.snapshot });
	const [done] = await conn
		.update(orPublications)
		.set({ status: "rolled_back" })
		.where(eq(orPublications.id, publicationId))
		.returning();
	await conn.update(orContentItems).set({ status: "rolled_back" }).where(eq(orContentItems.id, pub.contentItemId));
	const [brand] = await conn.select().from(brands).where(eq(brands.id, pub.brandId)).limit(1);
	await recordAudit(conn, {
		organizationId: brand!.organizationId,
		brandId: pub.brandId,
		actorType: "user",
		actorId: actor.userId,
		action: "content.rolled_back",
		subjectType: "publication",
		subjectId: publicationId,
	});
	return done!;
}
