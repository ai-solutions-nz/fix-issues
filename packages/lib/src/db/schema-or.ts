import {
	bigint,
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	real,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { brands, prompts } from "./schema";
import { organization, user } from "./schema-auth";

/** Append-only record of who changed what (users, agents and the system). A trigger rejects updates and deletes. */
export const orAuditLog = pgTable(
	"or_audit_log",
	{
		id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
		organizationId: text("organization_id")
			.references(() => organization.id)
			.notNull(),
		brandId: text("brand_id").references(() => brands.id),
		actorType: text("actor_type").$type<"user" | "agent" | "system">().notNull(),
		actorId: text("actor_id"),
		action: text("action").notNull(),
		subjectType: text("subject_type").notNull(),
		subjectId: text("subject_id"),
		details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("or_audit_log_org_created_idx").on(table.organizationId, table.createdAt)],
).enableRLS();

/** The client business's identity facts: the reference that brand-accuracy and completeness audits check against. */
export const orBrandProfiles = pgTable("or_brand_profiles", {
	brandId: text("brand_id")
		.primaryKey()
		.references(() => brands.id, { onDelete: "cascade" }),
	legalName: text("legal_name"),
	category: text("category"),
	description: text("description"),
	phone: text("phone"),
	email: text("email"),
	streetAddress: text("street_address"),
	/** Primary service location; drives location-targeted collection. ISO 3166-1 alpha-2 country. */
	country: text("country").notNull().default("NZ"),
	region: text("region"),
	city: text("city"),
	postcode: text("postcode"),
	serviceAreas: text("service_areas").array().notNull().default([]),
	services: text("services").array().notNull().default([]),
	openingHours: text("opening_hours"),
	sameAs: text("same_as").array().notNull().default([]),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
}).enableRLS();

/** Buyer-question metadata Online Reset keeps beside Elmo's prompt rows. */
export const orPromptMeta = pgTable(
	"or_prompt_meta",
	{
		promptId: uuid("prompt_id")
			.primaryKey()
			.references(() => prompts.id, { onDelete: "cascade" }),
		brandId: text("brand_id")
			.references(() => brands.id)
			.notNull(),
		intent: text("intent"),
		clusterId: uuid("cluster_id"),
		clusterLabel: text("cluster_label"),
		/** Embedding used for dedup and clustering; null when embeddings were not available. */
		embedding: real("embedding").array(),
		embeddingModel: text("embedding_model"),
		validation: jsonb("validation").$type<{ status: "accepted" | "rejected"; reasons: string[] }>(),
		source: text("source").$type<"generated" | "template" | "imported" | "manual">().notNull().default("manual"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("or_prompt_meta_brand_idx").on(table.brandId)],
).enableRLS();

/** Which brands a member with the `client` role may see. Agency roles (owner, admin, member) see every brand. */
export const orMemberBrandAccess = pgTable(
	"or_member_brand_access",
	{
		organizationId: text("organization_id")
			.references(() => organization.id, { onDelete: "cascade" })
			.notNull(),
		userId: text("user_id")
			.references(() => user.id, { onDelete: "cascade" })
			.notNull(),
		brandId: text("brand_id")
			.references(() => brands.id, { onDelete: "cascade" })
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [primaryKey({ columns: [table.organizationId, table.userId, table.brandId] })],
).enableRLS();

/** One audit of a brand's site (and its competitors' sites): the Elmo site-audit report plus Online Reset findings. */
export const orAuditRuns = pgTable(
	"or_audit_runs",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		brandId: text("brand_id")
			.references(() => brands.id, { onDelete: "cascade" })
			.notNull(),
		status: text("status").$type<"running" | "completed" | "failed">().notNull().default("running"),
		siteReport: jsonb("site_report").$type<unknown>(),
		findings: jsonb("findings").$type<unknown[]>().notNull().default([]),
		scores: jsonb("scores").$type<unknown[]>().notNull().default([]),
		brandCompleteness: real("brand_completeness"),
		agentReadiness: real("agent_readiness"),
		pagesAudited: text("pages_audited").array().notNull().default([]),
		/** Title and headings of each audited page, enough to match questions to pages without re-crawling. */
		pageOutline: jsonb("page_outline")
			.$type<{ url: string; title: string; headings: { level: number; text: string }[] }[]>()
			.notNull()
			.default([]),
		competitorPages: jsonb("competitor_pages").$type<Record<string, string[]>>().notNull().default({}),
		error: text("error"),
		startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
	},
	(table) => [index("or_audit_runs_brand_started_idx").on(table.brandId, table.startedAt)],
).enableRLS();

/** Prioritised, evidence-linked recommendations. Recomputed in place; a human's status decision survives recomputation. */
export const orOpportunities = pgTable(
	"or_opportunities",
	{
		brandId: text("brand_id")
			.references(() => brands.id, { onDelete: "cascade" })
			.notNull(),
		opportunityId: text("opportunity_id").notNull(),
		type: text("type").notNull(),
		title: text("title").notNull(),
		rationale: text("rationale").notNull(),
		recommendedAction: text("recommended_action").notNull(),
		priority: real("priority").notNull(),
		components: jsonb("components").$type<Record<string, number>>().notNull(),
		evidence: jsonb("evidence")
			.$type<{ runIds: string[]; findingIds: string[]; sources: string[]; promptIds: string[] }>()
			.notNull(),
		/** The collection method the visibility evidence came from. */
		collectionMethod: text("collection_method"),
		auditRunId: uuid("audit_run_id").references(() => orAuditRuns.id, { onDelete: "set null" }),
		status: text("status").$type<"open" | "in_progress" | "done" | "dismissed">().notNull().default("open"),
		/** False once a recomputation no longer produces it. */
		current: boolean("current").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [primaryKey({ columns: [table.brandId, table.opportunityId] })],
).enableRLS();

/** A client's CMS. The credential is encrypted with the deployment key, bound to this row. */
export const orCmsConnections = pgTable("or_cms_connections", {
	id: uuid("id").defaultRandom().primaryKey(),
	brandId: text("brand_id")
		.references(() => brands.id, { onDelete: "cascade" })
		.notNull(),
	kind: text("kind").$type<"wordpress" | "shopify">().notNull(),
	label: text("label").notNull(),
	baseUrl: text("base_url").notNull(),
	/** WordPress user for the application password; null for Shopify. */
	username: text("username"),
	encryptedSecret: text("encrypted_secret").notNull(),
	/** "publish" goes live; "draft" lands as a CMS draft for a final check in the CMS. */
	publishStatus: text("publish_status").$type<"publish" | "draft">().notNull().default("draft"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export const orContentItems = pgTable(
	"or_content_items",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		brandId: text("brand_id")
			.references(() => brands.id, { onDelete: "cascade" })
			.notNull(),
		opportunityId: text("opportunity_id"),
		kind: text("kind").$type<"service_page" | "schema_fix">().notNull(),
		title: text("title").notNull(),
		slug: text("slug").notNull(),
		metaDescription: text("meta_description").notNull().default(""),
		markdown: text("markdown").notNull().default(""),
		html: text("html").notNull().default(""),
		jsonLd: jsonb("json_ld").$type<Record<string, unknown> | null>(),
		claims: jsonb("claims").$type<{ text: string; source: string }[]>().notNull().default([]),
		research: jsonb("research").$type<Record<string, unknown>>().notNull().default({}),
		qa: jsonb("qa").$type<{ id: string; ok: boolean; detail: string; blocking: boolean }[]>().notNull().default([]),
		status: text("status")
			.$type<
				| "draft"
				| "qa_failed"
				| "ready_for_approval"
				| "pending_approval"
				| "approved"
				| "rejected"
				| "published"
				| "verified"
				| "rolled_back"
			>()
			.notNull()
			.default("draft"),
		version: integer("version").notNull().default(1),
		contentHash: text("content_hash").notNull(),
		createdBy: text("created_by"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("or_content_items_brand_idx").on(table.brandId)],
).enableRLS();

export const orApprovals = pgTable(
	"or_approvals",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		brandId: text("brand_id")
			.references(() => brands.id, { onDelete: "cascade" })
			.notNull(),
		contentItemId: uuid("content_item_id")
			.references(() => orContentItems.id, { onDelete: "cascade" })
			.notNull(),
		contentVersion: integer("content_version").notNull(),
		/** The exact content approved; publishing requires the item still hashes to this. */
		contentHash: text("content_hash").notNull(),
		status: text("status").$type<"pending" | "approved" | "rejected" | "superseded">().notNull().default("pending"),
		requestedBy: text("requested_by"),
		decidedBy: text("decided_by"),
		decidedRole: text("decided_role"),
		comment: text("comment"),
		requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
	},
	(table) => [index("or_approvals_brand_status_idx").on(table.brandId, table.status)],
).enableRLS();

export const orPublications = pgTable(
	"or_publications",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		brandId: text("brand_id")
			.references(() => brands.id, { onDelete: "cascade" })
			.notNull(),
		contentItemId: uuid("content_item_id")
			.references(() => orContentItems.id, { onDelete: "cascade" })
			.notNull(),
		approvalId: uuid("approval_id")
			.references(() => orApprovals.id)
			.notNull(),
		contentHash: text("content_hash").notNull(),
		connectionId: uuid("connection_id").references(() => orCmsConnections.id, { onDelete: "set null" }),
		/** One publication per approved content version: a retried or concurrent publish cannot duplicate it. */
		idempotencyKey: text("idempotency_key").notNull().unique(),
		status: text("status")
			.$type<"publishing" | "published" | "failed" | "verified" | "verification_failed" | "rolled_back">()
			.notNull()
			.default("publishing"),
		remoteId: text("remote_id"),
		remoteUrl: text("remote_url"),
		/** What the CMS held before we wrote to it, for rollback; null when we created a new page. */
		snapshot: jsonb("snapshot").$type<Record<string, unknown> | null>(),
		verification: jsonb("verification").$type<Record<string, unknown> | null>(),
		retest: jsonb("retest").$type<Record<string, unknown> | null>(),
		error: text("error"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		publishedAt: timestamp("published_at", { withTimezone: true }),
	},
	(table) => [index("or_publications_brand_idx").on(table.brandId)],
).enableRLS();
