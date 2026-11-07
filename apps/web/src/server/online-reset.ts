/** Online Reset server functions. Every one runs inside withTenant, so Postgres row-level security applies. */
import { createServerFn } from "@tanstack/react-start";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { orContentItems } from "@workspace/lib/db/schema-or";
import { withTenant } from "@workspace/lib/db/tenant";
import { dashboardData, runEvidence } from "@workspace/lib/or/dashboard";
import { refreshOpportunities } from "@workspace/lib/or/opportunity-service";
import * as opt from "@workspace/lib/or/optimisation";
import { renderClientReport } from "@workspace/lib/or/report";
import { resolveTenantScope } from "@workspace/lib/or/tenant-scope";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthSession } from "@/lib/auth/helpers";

async function inTenant<T>(brandId: string, fn: (tx: DbConnection, actor: opt.Actor) => Promise<T>): Promise<T> {
	const session = await requireAuthSession();
	const scope = await resolveTenantScope(session.user.id, brandId);
	return withTenant(scope, (tx) => fn(tx, { userId: session.user.id, role: scope.role }));
}

/** Results cross the wire as a JSON string (dates become ISO strings); the client parses them back. */
const plain = (value: unknown): { json: string } => ({ json: JSON.stringify(value) });

const brandInput = z.object({ brandId: z.string() });

export const getOrDashboardFn = createServerFn({ method: "GET" })
	.validator(brandInput)
	.handler(async ({ data }) => plain(await inTenant(data.brandId, (tx) => dashboardData(tx, data.brandId))));

export const getRunEvidenceFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string(), runId: z.string().uuid() }))
	.handler(async ({ data }) => plain(await inTenant(data.brandId, (tx) => runEvidence(tx, data.brandId, data.runId))));

export const getContentItemFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string(), itemId: z.string().uuid() }))
	.handler(async ({ data }) =>
		plain(
			await inTenant(data.brandId, async (tx) => {
				const [item] = await tx
					.select()
					.from(orContentItems)
					.where(and(eq(orContentItems.id, data.itemId), eq(orContentItems.brandId, data.brandId)));
				if (!item) throw new Error("Content item not found");
				return item;
			}),
		),
	);

export const refreshOpportunitiesFn = createServerFn({ method: "POST" })
	.validator(brandInput)
	.handler(async ({ data }) => plain(await inTenant(data.brandId, (tx) => refreshOpportunities(tx, data.brandId))));

export const startContentFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), opportunityId: z.string() }))
	.handler(async ({ data }) =>
		plain(
			await inTenant(data.brandId, (tx, actor) =>
				opt.startFromOpportunity(tx, data.brandId, data.opportunityId, actor),
			),
		),
	);

export const reviseContentFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			itemId: z.string().uuid(),
			markdown: z.string().max(100_000),
			title: z.string().max(300).optional(),
			metaDescription: z.string().max(320).optional(),
		}),
	)
	.handler(async ({ data }) =>
		plain(
			await inTenant(data.brandId, (tx, actor) =>
				opt.reviseContent(
					tx,
					data.itemId,
					{ markdown: data.markdown, title: data.title, metaDescription: data.metaDescription },
					actor,
				),
			),
		),
	);

export const requestApprovalFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), itemId: z.string().uuid() }))
	.handler(async ({ data }) =>
		plain(await inTenant(data.brandId, (tx, actor) => opt.requestApproval(tx, data.itemId, actor))),
	);

export const decideApprovalFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			approvalId: z.string().uuid(),
			decision: z.enum(["approved", "rejected"]),
			comment: z.string().max(2000).optional(),
		}),
	)
	.handler(async ({ data }) =>
		plain(
			await inTenant(data.brandId, (tx, actor) =>
				opt.decideApproval(tx, data.approvalId, data.decision, actor, data.comment),
			),
		),
	);

export const publishContentFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), itemId: z.string().uuid(), connectionId: z.string().uuid() }))
	.handler(async ({ data }) =>
		plain(
			await inTenant(data.brandId, async (tx, actor) => {
				const pub = await opt.publishContent(tx, data.itemId, data.connectionId, actor);
				return pub.status === "published" ? opt.verifyPublication(tx, pub.id) : pub;
			}),
		),
	);

export const rollbackPublicationFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), publicationId: z.string().uuid() }))
	.handler(async ({ data }) =>
		plain(await inTenant(data.brandId, (tx, actor) => opt.rollbackPublication(tx, data.publicationId, actor))),
	);

export const getClientReportFn = createServerFn({ method: "GET" })
	.validator(brandInput)
	.handler(async ({ data }) =>
		plain({
			html: await inTenant(data.brandId, async (tx) => renderClientReport(await dashboardData(tx, data.brandId))),
		}),
	);
