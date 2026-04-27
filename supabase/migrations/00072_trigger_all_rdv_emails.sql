-- Le trigger schedule_rdv_emails ne firait que pour les RDVs avec
-- external_booking_id (= bookings Cal.com). Désormais il fire pour TOUS
-- les RDVs créés (manuellement via le CRM aussi). Le check email_null
-- côté fonction reste comme safety pour skip si pas d'email.

CREATE OR REPLACE FUNCTION schedule_rdv_emails()
RETURNS TRIGGER AS $$
DECLARE
  v_prospect prospects%ROWTYPE;
  v_email TEXT;
  v_recipient_name TEXT;
  v_now TIMESTAMPTZ := now();
  v_token TEXT;
  v_confirmation_expires_at TIMESTAMPTZ;
  v_hours_until_rdv NUMERIC;
  v_confirm_at TIMESTAMPTZ;
  v_confirm_reminder_1_at TIMESTAMPTZ;
  v_confirm_reminder_2_at TIMESTAMPTZ;
  v_trust_at TIMESTAMPTZ;
  v_tomorrow_at TIMESTAMPTZ;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  -- Skip si RDV passé (peut arriver lors d'imports historiques)
  IF NEW.scheduled_at < v_now THEN RETURN NEW; END IF;

  -- Skip si statut terminal (annule / no_show / fait / close / perdu)
  IF NEW.status IN ('annule', 'no_show', 'fait', 'close', 'perdu') THEN RETURN NEW; END IF;

  -- Récupérer prospect
  SELECT * INTO v_prospect FROM prospects WHERE id = NEW.prospect_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_email := v_prospect.contact_email;
  IF v_email IS NULL OR v_email = '' THEN RETURN NEW; END IF;

  v_recipient_name := COALESCE(
    NULLIF(TRIM(CONCAT_WS(' ', v_prospect.contact_firstname, v_prospect.contact_name)), ''),
    v_prospect.company_name
  );

  v_token := encode(gen_random_bytes(16), 'hex');
  v_confirmation_expires_at := NEW.scheduled_at + INTERVAL '7 days';

  INSERT INTO rdv_confirmations (rdv_id, token, expires_at)
  VALUES (NEW.id, v_token, v_confirmation_expires_at)
  ON CONFLICT (rdv_id) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at;

  v_hours_until_rdv := EXTRACT(EPOCH FROM (NEW.scheduled_at - v_now)) / 3600;

  IF v_hours_until_rdv >= 72 THEN
    v_confirm_at := v_now + INTERVAL '5 minutes';
    v_confirm_reminder_1_at := v_now + INTERVAL '24 hours';
    v_confirm_reminder_2_at := v_now + INTERVAL '48 hours';
    v_trust_at := NEW.scheduled_at - INTERVAL '48 hours';
    v_tomorrow_at := NEW.scheduled_at - INTERVAL '24 hours';
  ELSIF v_hours_until_rdv >= 48 THEN
    v_confirm_at := v_now + INTERVAL '5 minutes';
    v_confirm_reminder_1_at := v_now + INTERVAL '12 hours';
    v_confirm_reminder_2_at := NULL;
    v_trust_at := NULL;
    v_tomorrow_at := NEW.scheduled_at - INTERVAL '24 hours';
  ELSIF v_hours_until_rdv >= 24 THEN
    v_confirm_at := v_now + INTERVAL '5 minutes';
    v_confirm_reminder_1_at := v_now + INTERVAL '8 hours';
    v_confirm_reminder_2_at := NULL;
    v_trust_at := NULL;
    v_tomorrow_at := NEW.scheduled_at - INTERVAL '12 hours';
  ELSIF v_hours_until_rdv >= 6 THEN
    v_confirm_at := v_now + INTERVAL '2 minutes';
    v_confirm_reminder_1_at := NEW.scheduled_at - INTERVAL '2 hours';
    v_confirm_reminder_2_at := NULL;
    v_trust_at := NULL;
    v_tomorrow_at := NULL;
  ELSE
    v_confirm_at := v_now + INTERVAL '1 minute';
    v_confirm_reminder_1_at := NULL;
    v_confirm_reminder_2_at := NULL;
    v_trust_at := NULL;
    v_tomorrow_at := NULL;
  END IF;

  INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
  VALUES (NEW.id, NEW.prospect_id, v_email, v_recipient_name, 'rdv_confirmation', v_confirm_at, jsonb_build_object('token', v_token), 'scheduled');

  IF v_confirm_reminder_1_at IS NOT NULL THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
    VALUES (NEW.id, NEW.prospect_id, v_email, v_recipient_name, 'rdv_confirmation_reminder', v_confirm_reminder_1_at, jsonb_build_object('token', v_token, 'reminder_number', 1), 'scheduled');
  END IF;

  IF v_confirm_reminder_2_at IS NOT NULL THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
    VALUES (NEW.id, NEW.prospect_id, v_email, v_recipient_name, 'rdv_confirmation_reminder', v_confirm_reminder_2_at, jsonb_build_object('token', v_token, 'reminder_number', 2), 'scheduled');
  END IF;

  IF v_trust_at IS NOT NULL THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
    VALUES (NEW.id, NEW.prospect_id, v_email, v_recipient_name, 'rdv_trust_builder', v_trust_at, jsonb_build_object('token', v_token), 'scheduled');
  END IF;

  IF v_tomorrow_at IS NOT NULL THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
    VALUES (NEW.id, NEW.prospect_id, v_email, v_recipient_name, 'rdv_tomorrow', v_tomorrow_at, jsonb_build_object('token', v_token), 'scheduled');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recrée le trigger SANS la condition WHEN external_booking_id IS NOT NULL
DROP TRIGGER IF EXISTS trg_schedule_rdv_emails ON rendez_vous;
CREATE TRIGGER trg_schedule_rdv_emails
  AFTER INSERT ON rendez_vous
  FOR EACH ROW
  EXECUTE FUNCTION schedule_rdv_emails();
