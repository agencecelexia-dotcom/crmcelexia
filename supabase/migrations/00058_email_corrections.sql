-- Corrections post-test système email pré-RDV
-- 1. Drop triggers + functions liés à client_welcome (Thomas gère manuellement via CRM)
-- 2. Modifier on_rdv_status_email pour retirer la branche 'fait' (followup_positive supprimé)

-- 1. Drop trigger client_welcome (le flow signature passe par création manuelle du client dans le CRM)
DROP TRIGGER IF EXISTS trg_opp_close_schedule_welcome ON opportunities;
DROP FUNCTION IF EXISTS on_opp_close_schedule_welcome();

-- 2. Refondre le trigger rdv_status_email : retirer branche 'fait' (rdv_followup_positive supprimé)
-- Garde uniquement les emails à valeur opérationnelle : annulation et no-show
CREATE OR REPLACE FUNCTION on_rdv_status_email()
RETURNS TRIGGER AS $$
DECLARE
  v_prospect prospects%ROWTYPE;
  v_email TEXT;
  v_name TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  SELECT * INTO v_prospect FROM prospects WHERE id = NEW.prospect_id;
  IF NOT FOUND OR v_prospect.contact_email IS NULL OR v_prospect.contact_email = '' THEN
    RETURN NEW;
  END IF;
  v_email := v_prospect.contact_email;
  v_name := COALESCE(
    NULLIF(TRIM(CONCAT_WS(' ', v_prospect.contact_firstname, v_prospect.contact_name)), ''),
    v_prospect.company_name
  );

  IF NEW.status = 'annule' THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
    VALUES (NEW.id, NEW.prospect_id, v_email, v_name, 'rdv_cancelled', v_now + INTERVAL '5 minutes', '{}'::jsonb, 'scheduled');
  ELSIF NEW.status = 'no_show' THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
    VALUES (NEW.id, NEW.prospect_id, v_email, v_name, 'rdv_noshow', v_now + INTERVAL '15 minutes', '{}'::jsonb, 'scheduled');
  END IF;
  -- Branche 'fait' supprimée : Thomas a jugé le followup_positive non utile

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger se ré-attache automatiquement à la function (signature inchangée)

-- 3. Mark client_welcome / rdv_followup_positive comme inactifs en DB (le re-seed va les supprimer)
UPDATE email_templates SET is_active = false WHERE slug IN ('client_welcome', 'rdv_followup_positive');
