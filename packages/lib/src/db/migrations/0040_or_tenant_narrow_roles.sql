-- Online Reset (Packet 1b): narrow what a tenant may write, and what a
-- restricted caller may read.
--
-- * or.restricted_org_ids lists the organizations where the caller is
--   restricted (client role, or a brand-scoped API key). API keys and the
--   subscription of those organizations are invisible to them.
-- * apikey, subscription and member are read-only to every tenant; better-auth
--   and provisioning write them on the system handle.
-- * or.admin_org_ids lists the organizations the caller owns or administers.
--   Only those may be renamed, and only their name and slug columns.
CREATE OR REPLACE FUNCTION or_restricted_orgs() RETURNS text[]
	LANGUAGE sql STABLE
	AS $$ SELECT coalesce(string_to_array(nullif(current_setting('or.restricted_org_ids', true), ''), ','), ARRAY[]::text[]) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION or_admin_orgs() RETURNS text[]
	LANGUAGE sql STABLE
	AS $$ SELECT coalesce(string_to_array(nullif(current_setting('or.admin_org_ids', true), ''), ','), ARRAY[]::text[]) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION or_tenant_policy_expr(p_table text) RETURNS text
	LANGUAGE plpgsql STABLE
	AS $$
	DECLARE
		cols text[];
	BEGIN
		SELECT array_agg(column_name::text) INTO cols
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = p_table;
		IF p_table = 'brands' THEN
			RETURN 'organization_id = ANY (or_current_orgs()) AND (or_current_brand_ids() IS NULL OR id = ANY (or_current_brand_ids()))';
		ELSIF p_table = 'organization' THEN
			RETURN 'id = ANY (or_current_orgs())';
		ELSIF p_table = 'user' THEN
			RETURN 'or_user_visible(id)';
		ELSIF p_table = 'cited_pages' THEN
			RETURN 'or_page_visible(id)';
		ELSIF p_table IN ('apikey', 'subscription') THEN
			RETURN 'reference_id = ANY (or_current_orgs()) AND NOT (reference_id = ANY (or_restricted_orgs()))';
		ELSIF 'brand_id' = ANY (cols) AND 'organization_id' = ANY (cols) THEN
			RETURN 'organization_id = ANY (or_current_orgs()) AND (brand_id IS NULL OR or_brand_visible(brand_id))';
		ELSIF 'brand_id' = ANY (cols) THEN
			RETURN 'or_brand_visible(brand_id)';
		ELSIF 'organization_id' = ANY (cols) THEN
			RETURN 'organization_id = ANY (or_current_orgs())';
		ELSIF 'run_id' = ANY (cols) THEN
			RETURN 'or_run_visible(run_id)';
		ELSIF 'prompt_run_id' = ANY (cols) THEN
			RETURN 'or_run_visible(prompt_run_id)';
		ELSIF 'prompt_id' = ANY (cols) THEN
			RETURN 'or_prompt_visible(prompt_id)';
		END IF;
		RETURN NULL;
	END
	$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION or_apply_tenant_policies() RETURNS void
	LANGUAGE plpgsql
	AS $$
	DECLARE
		t record;
		expr text;
	BEGIN
		FOR t IN
			SELECT c.relname AS name
			FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = 'public' AND c.relkind = 'r'
		LOOP
			expr := or_tenant_policy_expr(t.name);
			EXECUTE format('DROP POLICY IF EXISTS or_tenant_isolation ON %I', t.name);
			EXECUTE format('DROP POLICY IF EXISTS or_tenant_admin_update ON %I', t.name);
			EXECUTE format('REVOKE ALL ON %I FROM or_tenant', t.name);
			CONTINUE WHEN expr IS NULL;
			EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.name);
			-- Identity, billing and reference tables are read-only to tenants.
			IF t.name IN ('organization', 'user', 'cited_pages', 'apikey', 'subscription', 'member') THEN
				EXECUTE format('CREATE POLICY or_tenant_isolation ON %I FOR SELECT TO or_tenant USING (%s)', t.name, expr);
				EXECUTE format('GRANT SELECT ON %I TO or_tenant', t.name);
			ELSE
				EXECUTE format('CREATE POLICY or_tenant_isolation ON %I TO or_tenant USING (%s) WITH CHECK (%s)', t.name, expr, expr);
				EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO or_tenant', t.name);
			END IF;
		END LOOP;
		-- An owner or admin may rename their own organization: name and slug only.
		EXECUTE 'CREATE POLICY or_tenant_admin_update ON organization FOR UPDATE TO or_tenant USING (id = ANY (or_admin_orgs())) WITH CHECK (id = ANY (or_admin_orgs()))';
		EXECUTE 'GRANT UPDATE (name, slug) ON organization TO or_tenant';
		EXECUTE 'GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO or_tenant';
	END
	$$;
--> statement-breakpoint
SELECT or_apply_tenant_policies();
