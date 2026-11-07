import { bigint, index, jsonb, pgTable, primaryKey, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
