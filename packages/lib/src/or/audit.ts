import type { DbConnection } from "../db/db-connection";
import { orAuditLog } from "../db/schema-or";

export interface AuditEntry {
	organizationId: string;
	brandId?: string | null;
	actorType: "user" | "agent" | "system";
	actorId?: string | null;
	action: string;
	subjectType: string;
	subjectId?: string | null;
	details?: Record<string, unknown>;
}

/** Append to the immutable audit log. Pass the caller's transaction so the record commits with the change it describes. */
export async function recordAudit(conn: DbConnection, entry: AuditEntry): Promise<void> {
	await conn.insert(orAuditLog).values({ ...entry, details: entry.details ?? {} });
}
