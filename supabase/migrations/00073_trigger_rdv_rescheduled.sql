-- Trigger manquant : rdv_rescheduled fire quand rendez_vous.scheduled_at change.
-- Le webhook Cal.com (BOOKING_RESCHEDULED) update scheduled_at, mais aucun email
-- ne partait jusqu'ici → prospect pas informé de la nouvelle date.

CREATE OR REPLACE FUNCTION on_rdv_rescheduled()
RETURNS TRIGGER AS $$
DECLARE
  v_prospect prospects%ROWTYPE;
  v_email TEXT;
  v_recipient_name TEXT;
  v_token TEXT;
  v_old_dt TIMESTAMPTZ;
  v_new_dt TIMESTAMPTZ;
  v_old_human TEXT;
  v_new_human TEXT;
  v_new_time TEXT;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  -- Skip si la date n'a pas changé
  IF NEW.scheduled_at IS NOT DISTINCT FROM OLD.scheduled_at THEN RETURN NEW; END IF;

  -- Skip si statut terminal (un RDV annulé/closé n'est pas vraiment "replanifié")
  IF NEW.status IN ('annule', 'no_show', 'fait', 'close', 'perdu') THEN RETURN NEW; END IF;

  -- Skip si nouveau RDV dans le passé (cas import historique ou correction)
  IF NEW.scheduled_at < now() THEN RETURN NEW; END IF;

  -- Charge prospect
  SELECT * INTO v_prospect FROM prospects WHERE id = NEW.prospect_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_email := v_prospect.contact_email;
  IF v_email IS NULL OR v_email = '' THEN RETURN NEW; END IF;

  v_recipient_name := COALESCE(
    NULLIF(TRIM(CONCAT_WS(' ', v_prospect.contact_firstname, v_prospect.contact_name)), ''),
    v_prospect.company_name
  );

  -- Récupère le token (créé par schedule_rdv_emails ou créé à la volée si manquant)
  SELECT token INTO v_token FROM rdv_confirmations WHERE rdv_id = NEW.id;
  IF v_token IS NULL THEN
    v_token := encode(gen_random_bytes(16), 'hex');
    INSERT INTO rdv_confirmations (rdv_id, token, expires_at)
      VALUES (NEW.id, v_token, NEW.scheduled_at + INTERVAL '7 days')
      ON CONFLICT (rdv_id) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at;
  END IF;

  -- Format des dates en FR (Europe/Paris)
  v_old_dt := OLD.scheduled_at AT TIME ZONE 'Europe/Paris';
  v_new_dt := NEW.scheduled_at AT TIME ZONE 'Europe/Paris';
  v_old_human := TO_CHAR(v_old_dt, 'TMDay DD TMMonth') || ' à ' || TO_CHAR(v_old_dt, 'HH24"h"MI');
  v_new_human := TO_CHAR(v_new_dt, 'TMDay DD TMMonth') || ' à ' || TO_CHAR(v_new_dt, 'HH24"h"MI');
  v_new_time := TO_CHAR(v_new_dt, 'HH24"h"MI');

  INSERT INTO email_schedule (
    rdv_id, prospect_id, recipient_email, recipient_name, email_type,
    scheduled_at, payload, status
  ) VALUES (
    NEW.id, NEW.prospect_id, v_email, v_recipient_name, 'rdv_rescheduled',
    now() + INTERVAL '1 minute',
    jsonb_build_object(
      'token', v_token,
      'old_rdv_date_human', v_old_human,
      'new_rdv_date_human', v_new_human,
      'new_rdv_time_human', v_new_time
    ),
    'scheduled'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rdv_rescheduled ON rendez_vous;
CREATE TRIGGER trg_rdv_rescheduled
  AFTER UPDATE OF scheduled_at ON rendez_vous
  FOR EACH ROW
  EXECUTE FUNCTION on_rdv_rescheduled();
