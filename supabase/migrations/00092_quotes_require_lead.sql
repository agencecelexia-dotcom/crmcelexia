-- ════════════════════════════════════════════════════════════════════
-- 00092 — Devis non-brouillon doivent obligatoirement référencer un lead
-- (filet DB en complément du flow front qui force la sélection).
-- Les brouillons (status='draft') restent autorisés sans lead pour
-- rétrocompat (devis créés avant la refonte).
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_quote_has_lead()
RETURNS TRIGGER AS $$
BEGIN
  -- Les founders Celexia peuvent tout faire (cohérent avec 00087).
  IF public.is_founder() THEN
    RETURN NEW;
  END IF;
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'draft' AND NEW.portal_lead_id IS NULL THEN
    RAISE EXCEPTION 'Un devis non-brouillon doit être attribué à un lead (portal_lead_id requis).';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_quote_has_lead ON quotes;
CREATE TRIGGER trg_enforce_quote_has_lead
  BEFORE INSERT OR UPDATE OF status, portal_lead_id ON quotes
  FOR EACH ROW EXECUTE FUNCTION enforce_quote_has_lead();
