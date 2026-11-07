CREATE TABLE "or_audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "or_audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"brand_id" text,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "or_audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "or_brand_profiles" (
	"brand_id" text PRIMARY KEY NOT NULL,
	"legal_name" text,
	"category" text,
	"description" text,
	"phone" text,
	"email" text,
	"street_address" text,
	"country" text DEFAULT 'NZ' NOT NULL,
	"region" text,
	"city" text,
	"postcode" text,
	"service_areas" text[] DEFAULT '{}' NOT NULL,
	"services" text[] DEFAULT '{}' NOT NULL,
	"opening_hours" text,
	"same_as" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "or_brand_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "or_member_brand_access" (
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "or_member_brand_access_organization_id_user_id_brand_id_pk" PRIMARY KEY("organization_id","user_id","brand_id")
);
--> statement-breakpoint
ALTER TABLE "or_member_brand_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "or_prompt_meta" (
	"prompt_id" uuid PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"intent" text,
	"cluster_id" uuid,
	"cluster_label" text,
	"embedding" real[],
	"embedding_model" text,
	"validation" jsonb,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "or_prompt_meta" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "collection_method" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "location_requested" jsonb;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "location_applied" text;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "methodology_version" text;--> statement-breakpoint
ALTER TABLE "or_audit_log" ADD CONSTRAINT "or_audit_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_audit_log" ADD CONSTRAINT "or_audit_log_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_brand_profiles" ADD CONSTRAINT "or_brand_profiles_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_member_brand_access" ADD CONSTRAINT "or_member_brand_access_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_member_brand_access" ADD CONSTRAINT "or_member_brand_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_member_brand_access" ADD CONSTRAINT "or_member_brand_access_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_prompt_meta" ADD CONSTRAINT "or_prompt_meta_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_prompt_meta" ADD CONSTRAINT "or_prompt_meta_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "or_audit_log_org_created_idx" ON "or_audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "or_prompt_meta_brand_idx" ON "or_prompt_meta" USING btree ("brand_id");