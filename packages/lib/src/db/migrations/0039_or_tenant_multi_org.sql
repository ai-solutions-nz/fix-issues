-- Online Reset: tenant scope can span several organizations (a user who belongs
-- to several, or an API key's reach), and the legacy Elmo pages read a few
-- tables that carry no organization or brand column. withTenant() now sets
-- or.org_ids (comma-separated) and or.user_id; or.org_id stays readable.
CREATE OR REPLACE FUNCTION or_current_orgs() RETURNS text[]
	LANGUAGE sql STABLE
	AS $$ SELECT coalesce(string_to_array(nullif(current_setting('or.org_ids', true), ''), ','), string_to_array(nullif(current_setting('or.org_id', true), ''), ','), ARRAY[]::text[]) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION or_current_user() RETURNS text
	LANGUAGE sql STABLE
	AS $$ SELECT nullif(current_setting('or.user_id', true), '') $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION or_brand_visible(p_brand text) RETURNS boolean
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
	AS $$
		SELECT p_brand IS NOT NULL
			AND EXISTS (SELECT 1 FROM brands b WHERE b.id = p_brand AND b.organization_id = ANY (or_current_orgs()))
			AND (or_current_brand_ids() IS NULL OR p_brand = ANY (or_current_brand_ids()))
	$$;
--> statement-breakpoint
-- A user row is visible to that user and to members of an organization in scope.
CREATE OR REPLACE FUNCTION or_user_visible(p_user text) RETURNS boolean
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
	AS $$
		SELECT p_user = or_current_user()
			OR EXISTS (SELECT 1 FROM member m WHERE m.user_id = p_user AND m.organization_id = ANY (or_current_orgs()))
	$$;
--> statement-breakpoint
-- A cited page (a shared catalogue of public URLs) is visible only when a citation the tenant can see points at it.
CREATE OR REPLACE FUNCTION or_page_visible(p_page bigint) RETURNS boolean
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
	AS $$
		SELECT EXISTS (SELECT 1 FROM rollup_citation_pages r WHERE r.page_id = p_page AND or_brand_visible(r.brand_id))
			OR EXISTS (SELECT 1 FROM citations c WHERE c.page_id = p_page AND or_brand_visible(c.brand_id))
	$$;
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
			RETURN 'reference_id = ANY (or_current_orgs())';
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
			EXECUTE format('REVOKE ALL ON %I FROM or_tenant', t.name);
			CONTINUE WHEN expr IS NULL;
			EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.name);
			EXECUTE format('CREATE POLICY or_tenant_isolation ON %I TO or_tenant USING (%s) WITH CHECK (%s)', t.name, expr, expr);
			-- Reference and identity tables are read-only to tenants; better-auth and the worker write them.
			IF t.name IN ('organization', 'user', 'cited_pages') THEN
				EXECUTE format('GRANT SELECT ON %I TO or_tenant', t.name);
			ELSE
				EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO or_tenant', t.name);
			END IF;
		END LOOP;
		EXECUTE 'GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO or_tenant';
	END
	$$;
--> statement-breakpoint
SELECT or_apply_tenant_policies();
