-- Élargit le système email à tout le cycle de vie client
-- + ajout attachments (PDF contrat)
-- + triggers automatiques pour cancellation / no-show / follow-up / welcome client

-- 1. Étendre les email_types acceptés
ALTER TABLE email_schedule DROP CONSTRAINT IF EXISTS email_schedule_email_type_check;
ALTER TABLE email_schedule ADD CONSTRAINT email_schedule_email_type_check
  CHECK (email_type IN (
    -- Pré-RDV
    'rdv_confirmation', 'rdv_confirmation_reminder',
    'rdv_trust_builder', 'rdv_tomorrow',
    -- RDV lifecycle
    'rdv_cancelled', 'rdv_rescheduled',
    'rdv_followup_positive', 'rdv_noshow',
    -- Post-signature
    'client_welcome',
    -- Portail
    'portal_invitation', 'portal_onboarding_validated', 'portal_onboarding_corrections',
    'portal_onboarding_reminder',
    -- Notif interne
    'internal_devis_signed', 'internal_rdv_unconfirmed',
    'internal_payment_received', 'internal_lead_hot',
    -- Facturation / paiement (à venir)
    'payment_received', 'invoice_monthly',
    -- Legacy / divers
    'lead_hot_alert', 'admin_alert'
  ));

-- 2. Support attachments (PDF contrat etc)
-- Format : [{"filename": "contrat-celexia.pdf", "storage_path": "portal-documents/xxx", "content_type": "application/pdf"}]
ALTER TABLE email_schedule ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 3. Trigger : opportunity close → schedule client_welcome avec PDF contrat en pièce jointe
CREATE OR REPLACE FUNCTION on_opp_close_schedule_welcome()
RETURNS TRIGGER AS $$
DECLARE
  v_prospect prospects%ROWTYPE;
  v_client clients%ROWTYPE;
  v_onboarding portal_onboardings%ROWTYPE;
  v_recipient_email TEXT;
  v_recipient_name TEXT;
  v_attachments JSONB := '[]'::jsonb;
  v_payload JSONB := '{}'::jsonb;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  -- Trigger only on transition !close → close
  IF NEW.status != 'close' OR OLD.status = 'close' THEN RETURN NEW; END IF;

  -- Get prospect → email destinataire
  SELECT * INTO v_prospect FROM prospects WHERE id = NEW.prospect_id;
  IF NOT FOUND OR v_prospect.contact_email IS NULL OR v_prospect.contact_email = '' THEN
    RETURN NEW;
  END IF;

  v_recipient_email := v_prospect.contact_email;
  v_recipient_name := COALESCE(
    NULLIF(TRIM(CONCAT_WS(' ', v_prospect.contact_firstname, v_prospect.contact_name)), ''),
    v_prospect.company_name
  );

  -- Cherche client lié et son onboarding portal pour le PDF contrat
  SELECT * INTO v_client FROM clients WHERE prospect_id = NEW.prospect_id AND deleted_at IS NULL LIMIT 1;
  IF FOUND THEN
    SELECT * INTO v_onboarding FROM portal_onboardings WHERE client_id = v_client.id LIMIT 1;
    IF FOUND AND v_onboarding.signed_contract_path IS NOT NULL THEN
      v_attachments := jsonb_build_array(jsonb_build_object(
        'filename', 'Contrat-Celexia-' || COALESCE(v_client.company_name, 'client') || '.pdf',
        'storage_bucket', 'portal-documents',
        'storage_path', v_onboarding.signed_contract_path,
        'content_type', 'application/pdf'
      ));
    END IF;
  END IF;

  v_payload := jsonb_build_object(
    'opportunity_id', NEW.id,
    'opportunity_name', NEW.name,
    'project_price', NEW.project_price
  );

  INSERT INTO email_schedule (
    rdv_id, prospect_id, recipient_email, recipient_name, email_type,
    scheduled_at, payload, attachments, status
  ) VALUES (
    NULL, NEW.prospect_id, v_recipient_email, v_recipient_name, 'client_welcome',
    now() + INTERVAL '5 minutes', v_payload, v_attachments, 'scheduled'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_opp_close_schedule_welcome ON opportunities;
CREATE TRIGGER trg_opp_close_schedule_welcome
  AFTER UPDATE ON opportunities
  FOR EACH ROW
  EXECUTE FUNCTION on_opp_close_schedule_welcome();

-- 4. Trigger : RDV status change → emails appropriés
CREATE OR REPLACE FUNCTION on_rdv_status_email()
RETURNS TRIGGER AS $$
DECLARE
  v_prospect prospects%ROWTYPE;
  v_email TEXT;
  v_name TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  -- Skip si pas un changement de status
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

  -- Annulation
  IF NEW.status = 'annule' THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
    VALUES (NEW.id, NEW.prospect_id, v_email, v_name, 'rdv_cancelled', v_now + INTERVAL '5 minutes', '{}'::jsonb, 'scheduled');

  -- No-show
  ELSIF NEW.status = 'no_show' THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
    VALUES (NEW.id, NEW.prospect_id, v_email, v_name, 'rdv_noshow', v_now + INTERVAL '15 minutes', '{}'::jsonb, 'scheduled');

  -- RDV fait → followup positif J+1
  ELSIF NEW.status = 'fait' AND OLD.status != 'fait' THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
    VALUES (NEW.id, NEW.prospect_id, v_email, v_name, 'rdv_followup_positive', v_now + INTERVAL '24 hours', '{}'::jsonb, 'scheduled');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rdv_status_email ON rendez_vous;
CREATE TRIGGER trg_rdv_status_email
  AFTER UPDATE ON rendez_vous
  FOR EACH ROW
  EXECUTE FUNCTION on_rdv_status_email();

-- 5. Trigger : opportunity close → notification interne Thomas + Antoine
CREATE OR REPLACE FUNCTION on_opp_close_notify_team()
RETURNS TRIGGER AS $$
DECLARE
  v_prospect prospects%ROWTYPE;
  v_payload JSONB;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.status != 'close' OR OLD.status = 'close' THEN RETURN NEW; END IF;

  SELECT * INTO v_prospect FROM prospects WHERE id = NEW.prospect_id;

  v_payload := jsonb_build_object(
    'company_name', COALESCE(v_prospect.company_name, 'Inconnu'),
    'contact_name', NULLIF(TRIM(CONCAT_WS(' ', v_prospect.contact_firstname, v_prospect.contact_name)), ''),
    'profession', v_prospect.profession,
    'city', v_prospect.city,
    'project_price', NEW.project_price,
    'budget_pub', NEW.budget_pub,
    'opportunity_name', NEW.name
  );

  -- Notif Antoine
  INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
  VALUES (NULL, NEW.prospect_id, 'antoine@celexia-pro.fr', 'Antoine', 'internal_devis_signed', now() + INTERVAL '1 minute', v_payload, 'scheduled');

  -- Notif Thomas
  INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
  VALUES (NULL, NEW.prospect_id, 'thomas@celexia-agence.fr', 'Thomas', 'internal_devis_signed', now() + INTERVAL '1 minute', v_payload, 'scheduled');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_opp_close_notify_team ON opportunities;
CREATE TRIGGER trg_opp_close_notify_team
  AFTER UPDATE ON opportunities
  FOR EACH ROW
  EXECUTE FUNCTION on_opp_close_notify_team();
