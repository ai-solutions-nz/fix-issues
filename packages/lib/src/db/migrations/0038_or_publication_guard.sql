-- Online Reset: tenant policies for the optimisation tables, and a database
-- guard so nothing is published without an approval of exactly that content.
SELECT or_apply_tenant_policies();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION or_require_approved_content() RETURNS trigger
	LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
	AS $$
	DECLARE
		a record;
	BEGIN
		SELECT status, content_hash, content_item_id, brand_id INTO a FROM or_approvals WHERE id = NEW.approval_id;
		IF a IS NULL OR a.status <> 'approved' THEN
			RAISE EXCEPTION 'publication requires an approved approval';
		END IF;
		IF a.content_hash <> NEW.content_hash OR a.content_item_id <> NEW.content_item_id OR a.brand_id <> NEW.brand_id THEN
			RAISE EXCEPTION 'publication content does not match what was approved';
		END IF;
		RETURN NEW;
	END
	$$;
--> statement-breakpoint
CREATE TRIGGER or_publications_require_approval BEFORE INSERT ON or_publications
	FOR EACH ROW EXECUTE FUNCTION or_require_approved_content();
