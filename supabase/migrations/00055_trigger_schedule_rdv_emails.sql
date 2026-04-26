-- Trigger : à chaque INSERT dans rendez_vous avec external_booking_id (= RDV Cal.com),
-- planifie automatiquement 3 emails dans email_schedule.
--
-- Schedule :
--  Email 1 : Confirmation premium → NOW() + 15 minutes
--  Email 2 : Case study sectoriel  → scheduled_at - 48h
--  Email 3 : Récap J-1            → scheduled_at - 24h
--
-- Edge case : si rdv_at - 48h < now() + 15min (RDV pris à très court terme),
-- on réajuste pour respecter l'ordre + min 30 min entre emails.

-- Cleanup : la colonne cal_booking_id ajoutée en 00053 fait doublon avec external_booking_id
-- (existe depuis 00011). On la drop.
DROP INDEX IF EXISTS idx_rendez_vous_cal_booking_id;
ALTER TABLE rendez_vous DROP COLUMN IF EXISTS cal_booking_id;

-- Fonction qui planifie les 3 emails
CREATE OR REPLACE FUNCTION schedule_rdv_emails()
RETURNS TRIGGER AS $$
DECLARE
  v_prospect prospects%ROWTYPE;
  v_email TEXT;
  v_recipient_name TEXT;
  v_now TIMESTAMPTZ := now();
  v_confirm_at TIMESTAMPTZ;
  v_case_study_at TIMESTAMPTZ;
  v_recap_at TIMESTAMPTZ;
  v_min_gap INTERVAL := INTERVAL '30 minutes';
BEGIN
  -- Skip si pas un booking Cal.com (pas d'external_booking_id)
  IF NEW.external_booking_id IS NULL THEN RETURN NEW; END IF;

  -- Anti-boucle (défensif, peu probable ici)
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  -- Récupérer prospect pour avoir l'email
  SELECT * INTO v_prospect FROM prospects WHERE id = NEW.prospect_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_email := v_prospect.contact_email;
  IF v_email IS NULL OR v_email = '' THEN
    -- Pas d'email = on ne peut pas envoyer. Skip silencieusement.
    RETURN NEW;
  END IF;

  v_recipient_name := COALESCE(
    NULLIF(TRIM(CONCAT_WS(' ', v_prospect.contact_firstname, v_prospect.contact_name)), ''),
    v_prospect.company_name
  );

  -- Calcul des scheduled_at
  v_confirm_at := v_now + INTERVAL '15 minutes';
  v_case_study_at := NEW.scheduled_at - INTERVAL '48 hours';
  v_recap_at := NEW.scheduled_at - INTERVAL '24 hours';

  -- Edge cases : si RDV pris à court terme, ré-ordonner
  IF v_case_study_at < v_confirm_at + v_min_gap THEN
    v_case_study_at := v_confirm_at + v_min_gap;
  END IF;
  IF v_recap_at < v_case_study_at + v_min_gap THEN
    v_recap_at := v_case_study_at + v_min_gap;
  END IF;
  -- Si même le recap dépasse l'heure du RDV, on skip recap
  IF v_recap_at > NEW.scheduled_at - INTERVAL '5 minutes' THEN
    v_recap_at := NULL;
  END IF;
  -- Si même le case_study dépasse l'heure du RDV, skip case_study
  IF v_case_study_at > NEW.scheduled_at - INTERVAL '15 minutes' THEN
    v_case_study_at := NULL;
  END IF;

  -- Insert Email 1 (toujours)
  INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
  VALUES (NEW.id, NEW.prospect_id, v_email, v_recipient_name, 'rdv_confirmation', v_confirm_at, '{}'::jsonb, 'scheduled');

  -- Insert Email 2 si scheduling possible
  IF v_case_study_at IS NOT NULL THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
    VALUES (NEW.id, NEW.prospect_id, v_email, v_recipient_name, 'rdv_case_study', v_case_study_at, '{}'::jsonb, 'scheduled');
  END IF;

  -- Insert Email 3 si scheduling possible
  IF v_recap_at IS NOT NULL THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
    VALUES (NEW.id, NEW.prospect_id, v_email, v_recipient_name, 'rdv_recap_j1', v_recap_at, '{}'::jsonb, 'scheduled');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_schedule_rdv_emails ON rendez_vous;
CREATE TRIGGER trg_schedule_rdv_emails
  AFTER INSERT ON rendez_vous
  FOR EACH ROW
  WHEN (NEW.external_booking_id IS NOT NULL)
  EXECUTE FUNCTION schedule_rdv_emails();

-- Trigger annulation : à l'UPDATE rendez_vous → status='annule', cancel les emails non envoyés
CREATE OR REPLACE FUNCTION cancel_rdv_emails_on_status()
RETURNS TRIGGER AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  -- Si le RDV passe en annulé OU est soft-deleted
  IF (NEW.status = 'annule' AND OLD.status IS DISTINCT FROM 'annule')
     OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL) THEN
    UPDATE email_schedule
    SET status = 'cancelled',
        updated_at = now()
    WHERE rdv_id = NEW.id
      AND status = 'scheduled';
  END IF;

  -- Si le RDV est replanifié (scheduled_at change), recalculer scheduled_at des emails non envoyés
  IF OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at AND NEW.status != 'annule' AND NEW.deleted_at IS NULL THEN
    UPDATE email_schedule
    SET scheduled_at = CASE email_type
      WHEN 'rdv_case_study' THEN NEW.scheduled_at - INTERVAL '48 hours'
      WHEN 'rdv_recap_j1' THEN NEW.scheduled_at - INTERVAL '24 hours'
      ELSE scheduled_at -- confirm reste à H+15min de l'origine
    END,
    updated_at = now()
    WHERE rdv_id = NEW.id
      AND status = 'scheduled'
      AND email_type IN ('rdv_case_study', 'rdv_recap_j1');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cancel_rdv_emails_on_status ON rendez_vous;
CREATE TRIGGER trg_cancel_rdv_emails_on_status
  AFTER UPDATE ON rendez_vous
  FOR EACH ROW
  EXECUTE FUNCTION cancel_rdv_emails_on_status();
