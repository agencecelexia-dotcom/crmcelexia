-- Stratégie zéro no-show : système de confirmation par bouton + relances jusqu'à confirmation
--
-- Le prospect reçoit :
-- 1. Email confirmation (H+5min) avec bouton "Je confirme ma présence"
-- 2. Si pas confirmé après 24h ET RDV > 48h → email rappel confirmation (urgent)
-- 3. Si pas confirmé après 48h ET RDV > 24h → email rappel confirmation 2 (final)
-- 4. En parallèle : trust-builder (à RDV-48h, skip si RDV<48h)
-- 5. Email "demain" (RDV-24h, skip si RDV<24h, replacé par RDV-2h si très court)
--
-- L'envoi est ADAPTATIF selon la distance entre maintenant et le RDV.

-- Drop l'ancien trigger pour le remplacer
DROP TRIGGER IF EXISTS trg_schedule_rdv_emails ON rendez_vous;
DROP FUNCTION IF EXISTS schedule_rdv_emails();

-- Étendre l'enum email_type
ALTER TABLE email_schedule
  DROP CONSTRAINT IF EXISTS email_schedule_email_type_check;

ALTER TABLE email_schedule
  ADD CONSTRAINT email_schedule_email_type_check
  CHECK (email_type IN (
    'rdv_confirmation',
    'rdv_confirmation_reminder',
    'rdv_trust_builder',
    'rdv_tomorrow',
    'rdv_cancellation',
    'rdv_reschedule',
    'client_welcome','payment_received','onboarding_reminder',
    'lead_hot_alert','admin_alert'
  ));

-- Table de confirmation : token unique par RDV pour le bouton "Je confirme"
CREATE TABLE IF NOT EXISTS rdv_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rdv_id UUID NOT NULL UNIQUE REFERENCES rendez_vous(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  confirmed_at TIMESTAMPTZ,
  confirmed_user_agent TEXT,
  confirmed_ip TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rdv_confirmations_token
  ON rdv_confirmations(token)
  WHERE confirmed_at IS NULL;

ALTER TABLE rdv_confirmations ENABLE ROW LEVEL SECURITY;

-- Pas de policy → seul service_role peut accéder (via edge function)

-- Nouveau trigger : stratégie ZÉRO no-show adaptative
CREATE OR REPLACE FUNCTION schedule_rdv_emails()
RETURNS TRIGGER AS $$
DECLARE
  v_prospect prospects%ROWTYPE;
  v_email TEXT;
  v_recipient_name TEXT;
  v_now TIMESTAMPTZ := now();
  v_token TEXT;
  v_confirmation_expires_at TIMESTAMPTZ;

  -- Distance entre maintenant et le RDV
  v_hours_until_rdv NUMERIC;

  -- Schedules calculés
  v_confirm_at TIMESTAMPTZ;
  v_confirm_reminder_1_at TIMESTAMPTZ;
  v_confirm_reminder_2_at TIMESTAMPTZ;
  v_trust_at TIMESTAMPTZ;
  v_tomorrow_at TIMESTAMPTZ;
BEGIN
  -- Skip si pas un booking Cal.com
  IF NEW.external_booking_id IS NULL THEN RETURN NEW; END IF;
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  -- Récupérer prospect
  SELECT * INTO v_prospect FROM prospects WHERE id = NEW.prospect_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_email := v_prospect.contact_email;
  IF v_email IS NULL OR v_email = '' THEN RETURN NEW; END IF;

  v_recipient_name := COALESCE(
    NULLIF(TRIM(CONCAT_WS(' ', v_prospect.contact_firstname, v_prospect.contact_name)), ''),
    v_prospect.company_name
  );

  -- Génère token de confirmation (32 chars hexa)
  v_token := encode(gen_random_bytes(16), 'hex');
  v_confirmation_expires_at := NEW.scheduled_at + INTERVAL '7 days';

  INSERT INTO rdv_confirmations (rdv_id, token, expires_at)
  VALUES (NEW.id, v_token, v_confirmation_expires_at)
  ON CONFLICT (rdv_id) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at;

  -- Calcul distance temporelle
  v_hours_until_rdv := EXTRACT(EPOCH FROM (NEW.scheduled_at - v_now)) / 3600;

  -- ============================================================
  -- STRATÉGIE ADAPTATIVE selon v_hours_until_rdv
  -- ============================================================

  IF v_hours_until_rdv >= 72 THEN
    -- Cas A : RDV ≥ 3 jours → séquence complète
    v_confirm_at := v_now + INTERVAL '5 minutes';
    v_confirm_reminder_1_at := v_now + INTERVAL '24 hours';
    v_confirm_reminder_2_at := v_now + INTERVAL '48 hours';
    v_trust_at := NEW.scheduled_at - INTERVAL '48 hours';
    v_tomorrow_at := NEW.scheduled_at - INTERVAL '24 hours';

  ELSIF v_hours_until_rdv >= 48 THEN
    -- Cas B : RDV entre 48-72h → confirmation + 1 reminder + tomorrow, skip trust
    v_confirm_at := v_now + INTERVAL '5 minutes';
    v_confirm_reminder_1_at := v_now + INTERVAL '12 hours';
    v_confirm_reminder_2_at := NULL;
    v_trust_at := NULL;
    v_tomorrow_at := NEW.scheduled_at - INTERVAL '24 hours';

  ELSIF v_hours_until_rdv >= 24 THEN
    -- Cas C : RDV entre 24-48h → confirmation + tomorrow uniquement
    v_confirm_at := v_now + INTERVAL '5 minutes';
    v_confirm_reminder_1_at := v_now + INTERVAL '8 hours';
    v_confirm_reminder_2_at := NULL;
    v_trust_at := NULL;
    v_tomorrow_at := NEW.scheduled_at - INTERVAL '12 hours';

  ELSIF v_hours_until_rdv >= 6 THEN
    -- Cas D : RDV < 24h, > 6h → confirmation IMMÉDIATE + un seul reminder à RDV-2h
    v_confirm_at := v_now + INTERVAL '2 minutes';
    v_confirm_reminder_1_at := NEW.scheduled_at - INTERVAL '2 hours';
    v_confirm_reminder_2_at := NULL;
    v_trust_at := NULL;
    v_tomorrow_at := NULL;

  ELSE
    -- Cas E : RDV < 6h → urgent, confirmation immédiate uniquement
    v_confirm_at := v_now + INTERVAL '1 minute';
    v_confirm_reminder_1_at := NULL;
    v_confirm_reminder_2_at := NULL;
    v_trust_at := NULL;
    v_tomorrow_at := NULL;
  END IF;

  -- Insert Email 1 : Confirmation (toujours)
  INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
  VALUES (NEW.id, NEW.prospect_id, v_email, v_recipient_name, 'rdv_confirmation', v_confirm_at, jsonb_build_object('token', v_token), 'scheduled');

  -- Email 2 : Confirmation reminder 1 (si pas confirmé d'ici là)
  IF v_confirm_reminder_1_at IS NOT NULL THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
    VALUES (NEW.id, NEW.prospect_id, v_email, v_recipient_name, 'rdv_confirmation_reminder', v_confirm_reminder_1_at, jsonb_build_object('token', v_token, 'reminder_number', 1), 'scheduled');
  END IF;

  -- Email 3 : Confirmation reminder 2 (final, si pas confirmé d'ici là)
  IF v_confirm_reminder_2_at IS NOT NULL THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
    VALUES (NEW.id, NEW.prospect_id, v_email, v_recipient_name, 'rdv_confirmation_reminder', v_confirm_reminder_2_at, jsonb_build_object('token', v_token, 'reminder_number', 2), 'scheduled');
  END IF;

  -- Email 4 : Trust builder (case study court)
  IF v_trust_at IS NOT NULL THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
    VALUES (NEW.id, NEW.prospect_id, v_email, v_recipient_name, 'rdv_trust_builder', v_trust_at, jsonb_build_object('token', v_token), 'scheduled');
  END IF;

  -- Email 5 : Tomorrow (à demain)
  IF v_tomorrow_at IS NOT NULL THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
    VALUES (NEW.id, NEW.prospect_id, v_email, v_recipient_name, 'rdv_tomorrow', v_tomorrow_at, jsonb_build_object('token', v_token), 'scheduled');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_schedule_rdv_emails
  AFTER INSERT ON rendez_vous
  FOR EACH ROW
  WHEN (NEW.external_booking_id IS NOT NULL)
  EXECUTE FUNCTION schedule_rdv_emails();

-- Trigger : quand le prospect confirme, cancel les rdv_confirmation_reminder restants
CREATE OR REPLACE FUNCTION cancel_reminders_on_confirmation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.confirmed_at IS NOT NULL AND OLD.confirmed_at IS NULL THEN
    UPDATE email_schedule
    SET status = 'cancelled', updated_at = now()
    WHERE rdv_id = NEW.rdv_id
      AND email_type = 'rdv_confirmation_reminder'
      AND status = 'scheduled';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cancel_reminders_on_confirm ON rdv_confirmations;
CREATE TRIGGER trg_cancel_reminders_on_confirm
  AFTER UPDATE ON rdv_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION cancel_reminders_on_confirmation();
