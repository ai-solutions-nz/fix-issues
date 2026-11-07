CREATE TABLE "or_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"content_item_id" uuid NOT NULL,
	"content_version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" text,
	"decided_by" text,
	"decided_role" text,
	"comment" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "or_approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "or_cms_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"base_url" text NOT NULL,
	"username" text,
	"encrypted_secret" text NOT NULL,
	"publish_status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "or_cms_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "or_content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"opportunity_id" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"meta_description" text DEFAULT '' NOT NULL,
	"markdown" text DEFAULT '' NOT NULL,
	"html" text DEFAULT '' NOT NULL,
	"json_ld" jsonb,
	"claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"research" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"qa" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content_hash" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "or_content_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "or_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"content_item_id" uuid NOT NULL,
	"approval_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"connection_id" uuid,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'publishing' NOT NULL,
	"remote_id" text,
	"remote_url" text,
	"snapshot" jsonb,
	"verification" jsonb,
	"retest" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "or_publications_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "or_publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "or_approvals" ADD CONSTRAINT "or_approvals_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_approvals" ADD CONSTRAINT "or_approvals_content_item_id_or_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."or_content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_cms_connections" ADD CONSTRAINT "or_cms_connections_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_content_items" ADD CONSTRAINT "or_content_items_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_publications" ADD CONSTRAINT "or_publications_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_publications" ADD CONSTRAINT "or_publications_content_item_id_or_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."or_content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_publications" ADD CONSTRAINT "or_publications_approval_id_or_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."or_approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "or_publications" ADD CONSTRAINT "or_publications_connection_id_or_cms_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."or_cms_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "or_approvals_brand_status_idx" ON "or_approvals" USING btree ("brand_id","status");--> statement-breakpoint
CREATE INDEX "or_content_items_brand_idx" ON "or_content_items" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "or_publications_brand_idx" ON "or_publications" USING btree ("brand_id");