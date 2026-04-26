-- Email "votre premier devis a été signé" envoyé à l'artisan client
-- Trigger : portal_leads.status passe à 'signe'
-- Idempotent : envoyé une seule fois par client (vérifie si déjà envoyé)

-- 1. Étendre l'enum email_type
ALTER TABLE email_schedule DROP CONSTRAINT IF EXISTS email_schedule_email_type_check;
ALTER TABLE email_schedule ADD CONSTRAINT email_schedule_email_type_check
  CHECK (email_type IN (
    -- Pré-RDV
    'rdv_confirmation', 'rdv_confirmation_reminder',
    'rdv_trust_builder', 'rdv_tomorrow',
    -- RDV lifecycle
    'rdv_cancelled', 'rdv_rescheduled',
    'rdv_followup_positive', 'rdv_noshow',
    -- Post-signature Celexia
    'client_welcome',
    -- Portail
    'portal_invitation', 'portal_onboarding_validated', 'portal_onboarding_corrections',
    'portal_onboarding_reminder',
    -- Lifecycle artisan client
    'client_first_signed_quote',
    -- Notif interne
    'internal_devis_signed', 'internal_rdv_unconfirmed',
    'internal_payment_received', 'internal_lead_hot',
    -- Facturation / paiement
    'payment_received', 'invoice_monthly',
    -- Legacy / divers
    'lead_hot_alert', 'admin_alert'
  ));

-- 2. Trigger sur portal_leads → quand un lead passe à 'signe', envoyer l'email
--    seulement si c'est le PREMIER lead signé pour ce client
CREATE OR REPLACE FUNCTION on_portal_lead_signed()
RETURNS TRIGGER AS $$
DECLARE
  v_client clients%ROWTYPE;
  v_client_email TEXT;
  v_client_name TEXT;
  v_signed_count INT;
  v_payload JSONB;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  -- Skip si pas une transition vers 'signe'
  IF NEW.status != 'signe' OR OLD.status = 'signe' THEN RETURN NEW; END IF;

  -- Compte les leads signés précédents pour ce client (pour savoir si c'est le 1er)
  SELECT COUNT(*) INTO v_signed_count
  FROM portal_leads
  WHERE client_id = NEW.client_id
    AND status = 'signe'
    AND id != NEW.id
    AND deleted_at IS NULL;

  -- Si déjà au moins 1 lead signé avant celui-ci, on n'envoie pas (= pas le premier)
  IF v_signed_count > 0 THEN RETURN NEW; END IF;

  -- Récupère le client
  SELECT * INTO v_client FROM clients WHERE id = NEW.client_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_client_email := v_client.contact_email;
  IF v_client_email IS NULL OR v_client_email = '' THEN RETURN NEW; END IF;

  v_client_name := COALESCE(
    NULLIF(TRIM(CONCAT_WS(' ', v_client.contact_firstname, v_client.contact_name)), ''),
    v_client.company_name
  );

  v_payload := jsonb_build_object(
    'lead_id', NEW.id,
    'lead_company_name', NEW.name,
    'lead_quote_amount', NEW.signed_amount,
    'lead_commission_amount', NEW.commission_amount,
    'lead_commission_rate', ROUND(NEW.commission_rate * 100, 0)
  );

  INSERT INTO email_schedule (
    rdv_id, prospect_id, recipient_email, recipient_name, email_type,
    scheduled_at, payload, status
  ) VALUES (
    NULL, NULL, v_client_email, v_client_name, 'client_first_signed_quote',
    now() + INTERVAL '5 minutes', v_payload, 'scheduled'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_portal_lead_signed_email ON portal_leads;
CREATE TRIGGER trg_portal_lead_signed_email
  AFTER UPDATE ON portal_leads
  FOR EACH ROW
  EXECUTE FUNCTION on_portal_lead_signed();

-- 3. Insert le template en placeholder (le HTML sera seedé via script)
INSERT INTO email_templates (slug, description, subject_template, html_template, from_name, from_email, reply_to, is_active)
VALUES (
  'client_first_signed_quote',
  'Email à l''artisan client quand son PREMIER lead passe en signé (commission Celexia tombe)',
  'Bravo {{client_firstname}} · votre premier devis vient de tomber',
  '<p>Placeholder, à seeder via script reseed</p>',
  'Thomas de Celexia',
  'thomas@celexia-agence.fr',
  'thomas@celexia-agence.fr',
  true
)
ON CONFLICT (slug) DO NOTHING;
