import { serviceDb } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { orBrandProfiles } from "@workspace/lib/db/schema-or";
import { refreshOpportunities, runBrandAudit } from "@workspace/lib/or/audit-service";
import { eq } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";

/** Online Reset background jobs: weekly site audits and opportunity refreshes for every profiled brand. */
export const OR_AUDIT_SWEEP_QUEUE = "or-audit-sweep";
export const OR_BRAND_AUDIT_QUEUE = "or-brand-audit";
export const OR_FAILED_QUEUE = "or-failed";

export interface BrandAuditData {
	brandId: string;
}

export async function auditSweepJob(boss: Pick<PgBoss, "send">): Promise<number> {
	const rows = await serviceDb
		.select({ id: brands.id })
		.from(brands)
		.innerJoin(orBrandProfiles, eq(orBrandProfiles.brandId, brands.id))
		.where(eq(brands.enabled, true));
	for (const { id } of rows) {
		await boss.send(OR_BRAND_AUDIT_QUEUE, { brandId: id } satisfies BrandAuditData, {
			singletonKey: `or-audit:${id}`,
			singletonSeconds: 60 * 60,
		});
	}
	return rows.length;
}

export async function brandAuditJob(jobs: Job<BrandAuditData>[]): Promise<void> {
	for (const job of jobs) {
		await runBrandAudit(serviceDb, job.data.brandId);
		await refreshOpportunities(serviceDb, job.data.brandId);
	}
}

export async function registerOnlineResetJobs(boss: PgBoss): Promise<void> {
	await boss.createQueue(OR_FAILED_QUEUE, { retentionSeconds: 60 * 60 * 24 * 14 });
	await boss.createQueue(OR_AUDIT_SWEEP_QUEUE, {
		retryLimit: 2,
		retryDelay: 600,
		retryBackoff: true,
		expireInSeconds: 60 * 30,
	});
	await boss.createQueue(OR_BRAND_AUDIT_QUEUE, {
		retryLimit: 3,
		retryDelay: 300,
		retryBackoff: true,
		expireInSeconds: 60 * 30,
		deadLetter: OR_FAILED_QUEUE,
	});
	// Monday 03:17 New Zealand time, off the hour so it does not pile onto other jobs.
	await boss.schedule(
		OR_AUDIT_SWEEP_QUEUE,
		"17 3 * * 1",
		{},
		{ tz: "Pacific/Auckland", singletonKey: OR_AUDIT_SWEEP_QUEUE },
	);
	await boss.work(OR_AUDIT_SWEEP_QUEUE, { localConcurrency: 1 }, async () => {
		const queued = await auditSweepJob(boss);
		console.log(`[or-audit-sweep] queued ${queued} brand audit(s)`);
	});
	await boss.work<BrandAuditData>(OR_BRAND_AUDIT_QUEUE, { localConcurrency: 2 }, brandAuditJob);
	console.log("Registered Online Reset jobs: or-audit-sweep (weekly), or-brand-audit");
}
