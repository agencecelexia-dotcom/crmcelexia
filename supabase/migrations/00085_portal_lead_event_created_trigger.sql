-- Migration B8 (High H16) — atomicité de l'historique des leads
--
-- Avant : portal-lead-service.ts insérait dans portal_leads PUIS dans
-- portal_lead_events (event_type='created') en 2 calls Supabase distincts.
-- Si le 2e échouait (RLS, network, etc.), le lead existait sans event
-- "created" → trou dans l'historique, debug difficile.
--
-- Après : trigger AFTER INSERT ON portal_leads qui insère atomiquement
-- l'event 'created'. Tout ou rien dans la même transaction.
--
-- Le code service peut désormais juste insérer le lead.

CREATE OR REPLACE FUNCTION trigger_portal_lead_created_event()
RETURNS TRIGGER AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  INSERT INTO portal_lead_events (
    portal_lead_id,
    event_type,
    description,
    new_status
  ) VALUES (
    NEW.id,
    'created',
    'Lead "' || COALESCE(NEW.name, 'sans nom') || '" créé',
    COALESCE(NEW.status, 'nouveau')
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_portal_lead_created_event ON portal_leads;
CREATE TRIGGER trg_portal_lead_created_event
  AFTER INSERT ON portal_leads
  FOR EACH ROW
  EXECUTE FUNCTION trigger_portal_lead_created_event();
