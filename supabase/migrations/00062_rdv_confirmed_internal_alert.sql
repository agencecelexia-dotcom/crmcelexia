-- Quand le client clique "Je confirme ma présence" :
-- 1. Update rendez_vous.status -> 'confirme' pour qu'un badge cyan apparaisse dans le CRM
-- 2. Envoie un mail interne à agence.celexia@gmail.com pour prévenir l'équipe

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
    'internal_devis_signed', 'internal_rdv_unconfirmed', 'internal_rdv_confirmed',
    'internal_payment_received', 'internal_lead_hot',
    -- Facturation / paiement
    'payment_received', 'invoice_monthly',
    -- Legacy / divers
    'lead_hot_alert', 'admin_alert'
  ));

-- 2. Trigger : à la confirmation du RDV par le client, sync rendez_vous + alerte interne
CREATE OR REPLACE FUNCTION on_rdv_confirmation_set()
RETURNS TRIGGER AS $$
DECLARE
  v_rdv rendez_vous%ROWTYPE;
  v_prospect prospects%ROWTYPE;
  v_payload JSONB;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  -- Skip si pas une transition vers confirmé
  IF NEW.confirmed_at IS NULL OR OLD.confirmed_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_rdv FROM rendez_vous WHERE id = NEW.rdv_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Update status si encore en 'prevu' (sinon respecte les autres états)
  IF v_rdv.status = 'prevu' THEN
    UPDATE rendez_vous SET status = 'confirme' WHERE id = v_rdv.id;
  END IF;

  -- Récupère le prospect pour le payload
  SELECT * INTO v_prospect FROM prospects WHERE id = v_rdv.prospect_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_payload := jsonb_build_object(
    'prospect_id', v_prospect.id,
    'prospect_firstname', COALESCE(v_prospect.contact_firstname, ''),
    'prospect_lastname', COALESCE(v_prospect.contact_name, ''),
    'prospect_company', v_prospect.company_name,
    'prospect_profession', COALESCE(v_prospect.profession, '—'),
    'prospect_city', COALESCE(v_prospect.city, '—'),
    'prospect_phone', v_prospect.phone,
    'prospect_email', COALESCE(v_prospect.contact_email, '—'),
    'rdv_id', v_rdv.id,
    'meeting_url', COALESCE(v_rdv.meeting_url, 'https://cal.com/celexia/30min')
  );

  INSERT INTO email_schedule (
    rdv_id, prospect_id, recipient_email, recipient_name, email_type,
    scheduled_at, payload, status
  ) VALUES (
    v_rdv.id, v_prospect.id, 'agence.celexia@gmail.com', 'Celexia',
    'internal_rdv_confirmed', now() + INTERVAL '1 minute', v_payload, 'scheduled'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rdv_confirmation_set ON rdv_confirmations;
CREATE TRIGGER trg_rdv_confirmation_set
  AFTER UPDATE ON rdv_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION on_rdv_confirmation_set();

-- 3. Insert le template (HTML seedé via script)
INSERT INTO email_templates (slug, description, subject_template, html_template, from_name, from_email, reply_to, is_active)
VALUES (
  'internal_rdv_confirmed',
  'Mail interne Celexia : un prospect vient de confirmer sa présence au RDV (clic sur le bouton dans l''email)',
  'RDV confirmé · {{prospect_firstname}} {{prospect_lastname}} ({{prospect_profession}})',
  '<p>Placeholder, à seeder via script reseed</p>',
  'Celexia CRM',
  'antoine@celexia-pro.fr',
  'antoine@celexia-pro.fr',
  true
)
ON CONFLICT (slug) DO NOTHING;
