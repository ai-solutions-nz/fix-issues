-- Online Reset: database-enforced tenant isolation.
-- Web requests for tenant data run inside withTenant() (src/db/tenant.ts), which
-- switches to the or_tenant role and sets or.org_id / or.brand_ids for the
-- transaction. or_tenant is not a table owner and has no BYPASSRLS, so these
-- policies always apply to it. The connection owner (worker, migrations) keeps
-- its system scope.
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'or_tenant') THEN
		CREATE ROLE or_tenant NOLOGIN NOBYPASSRLS;
	END IF;
END
$$;
--> statement-breakpoint
GRANT or_tenant TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO or_tenant;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION or_current_org() RETURNS text
	LANGUAGE sql STABLE
	AS $$ SELECT nullif(current_setting('or.org_id', true), '') $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION or_current_brand_ids() RETURNS text[]
	LANGUAGE sql STABLE
	AS $$ SELECT string_to_array(nullif(current_setting('or.brand_ids', true), ''), ',') $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION or_brand_visible(p_brand text) RETURNS boolean
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
	AS $$
		SELECT p_brand IS NOT NULL
			AND EXISTS (SELECT 1 FROM brands b WHERE b.id = p_brand AND b.organization_id = or_current_org())
			AND (or_current_brand_ids() IS NULL OR p_brand = ANY (or_current_brand_ids()))
	$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION or_run_visible(p_run uuid) RETURNS boolean
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
	AS $$ SELECT EXISTS (SELECT 1 FROM prompt_runs r WHERE r.id = p_run AND or_brand_visible(r.brand_id)) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION or_prompt_visible(p_prompt uuid) RETURNS boolean
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
	AS $$ SELECT EXISTS (SELECT 1 FROM prompts p WHERE p.id = p_prompt AND or_brand_visible(p.brand_id)) $$;
--> statement-breakpoint
-- Derives each public table's policy from the column that scopes it. A table
-- with no tenancy column is not granted to or_tenant at all (deny by default).
-- Re-run from any later migration that adds tables: SELECT or_apply_tenant_policies();
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
			RETURN 'organization_id = or_current_org() AND (or_current_brand_ids() IS NULL OR id = ANY (or_current_brand_ids()))';
		ELSIF p_table = 'organization' THEN
			RETURN 'id = or_current_org()';
		ELSIF 'brand_id' = ANY (cols) AND 'organization_id' = ANY (cols) THEN
			RETURN 'organization_id = or_current_org() AND (brand_id IS NULL OR or_brand_visible(brand_id))';
		ELSIF 'brand_id' = ANY (cols) THEN
			RETURN 'or_brand_visible(brand_id)';
		ELSIF 'organization_id' = ANY (cols) THEN
			RETURN 'organization_id = or_current_org()';
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
			IF t.name = 'organization' THEN
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION or_reject_mutation() RETURNS trigger
	LANGUAGE plpgsql
	AS $$ BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$;
--> statement-breakpoint
CREATE TRIGGER or_audit_log_append_only BEFORE UPDATE OR DELETE ON or_audit_log
	FOR EACH ROW EXECUTE FUNCTION or_reject_mutation();
