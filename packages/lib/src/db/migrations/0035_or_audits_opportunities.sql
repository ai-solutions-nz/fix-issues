CREATE TABLE "or_audit_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"site_report" jsonb,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"brand_completeness" real,
	"agent_readiness" real,
	"pages_audited" text[] DEFAULT '{}' NOT NULL,
	"page_outline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"competitor_pages" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "or_audit_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "or_opportunities" (
	"brand_id" text NOT NULL,
	"opportunity_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"recommended_action" text NOT NULL,
	"priority" real NOT NULL,
	"components" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"collection_method" text,
	"audit_run_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "or_opportunities_brand_id_opportunity_id_pk" PRIMARY KEY("brand_id","opportunity_id")
);
--> statement-breakpoint
ALTER TABLE "or_opportunities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "or_audit_runs" ADD CONSTRAINT "or_audit_runs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_opportunities" ADD CONSTRAINT "or_opportunities_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_opportunities" ADD CONSTRAINT "or_opportunities_audit_run_id_or_audit_runs_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."or_audit_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "or_audit_runs_brand_started_idx" ON "or_audit_runs" USING btree ("brand_id","started_at");