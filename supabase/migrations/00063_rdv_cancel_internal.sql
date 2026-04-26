-- Quand un RDV est annulé (peu importe la source : client via lien, Cal.com webhook, admin),
-- envoie un mail interne à l'équipe Celexia pour les prévenir.
-- Le trigger existant on_rdv_status_email (00057) gère déjà l'envoi du mail rdv_cancelled au prospect.

-- 1. Étendre l'enum email_type pour ajouter internal_rdv_cancelled
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
    'internal_rdv_confirmed', 'internal_rdv_cancelled',
    'internal_payment_received', 'internal_lead_hot',
    -- Facturation / paiement
    'payment_received', 'invoice_monthly',
    -- Legacy / divers
    'lead_hot_alert', 'admin_alert'
  ));

-- 2. Trigger : à chaque transition d'un RDV vers 'annule', envoie un mail interne à l'équipe
CREATE OR REPLACE FUNCTION on_rdv_status_internal_alert()
RETURNS TRIGGER AS $$
DECLARE
  v_prospect prospects%ROWTYPE;
  v_rdv_date_human TEXT;
  v_rdv_time_human TEXT;
  v_payload JSONB;
  v_dt TIMESTAMPTZ;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status != 'annule' OR OLD.status = 'annule' THEN RETURN NEW; END IF;

  SELECT * INTO v_prospect FROM prospects WHERE id = NEW.prospect_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Format date FR (Europe/Paris)
  v_dt := NEW.scheduled_at AT TIME ZONE 'Europe/Paris';
  v_rdv_date_human := TO_CHAR(v_dt, 'TMDay DD TMMonth YYYY');
  v_rdv_time_human := TO_CHAR(v_dt, 'HH24"h"MI');

  v_payload := jsonb_build_object(
    'prospect_id', v_prospect.id,
    'prospect_firstname', COALESCE(v_prospect.contact_firstname, ''),
    'prospect_lastname', COALESCE(v_prospect.contact_name, ''),
    'prospect_company', v_prospect.company_name,
    'prospect_profession', COALESCE(v_prospect.profession, '—'),
    'prospect_city', COALESCE(v_prospect.city, '—'),
    'prospect_phone', v_prospect.phone,
    'prospect_email', COALESCE(v_prospect.contact_email, '—'),
    'rdv_id', NEW.id,
    'rdv_date_human', v_rdv_date_human,
    'rdv_time_human', v_rdv_time_human,
    'cancellation_reason', COALESCE(NEW.no_show_reason, '—')
  );

  INSERT INTO email_schedule (
    rdv_id, prospect_id, recipient_email, recipient_name, email_type,
    scheduled_at, payload, status
  ) VALUES (
    NEW.id, NEW.prospect_id, 'agence.celexia@gmail.com', 'Celexia',
    'internal_rdv_cancelled', now() + INTERVAL '1 minute', v_payload, 'scheduled'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rdv_status_internal_alert ON rendez_vous;
CREATE TRIGGER trg_rdv_status_internal_alert
  AFTER UPDATE ON rendez_vous
  FOR EACH ROW
  EXECUTE FUNCTION on_rdv_status_internal_alert();

-- 3. Insert le template (HTML seedé via script)
INSERT INTO email_templates (slug, description, subject_template, html_template, from_name, from_email, reply_to, is_active)
VALUES (
  'internal_rdv_cancelled',
  'Mail interne Celexia : un RDV vient d''être annulé (par le client via lien, par Cal.com webhook, ou par un admin du CRM)',
  'RDV annulé · {{prospect_firstname}} {{prospect_lastname}} ({{prospect_profession}})',
  '<p>Placeholder, à seeder via script reseed</p>',
  'Celexia CRM',
  'antoine@celexia-pro.fr',
  'antoine@celexia-pro.fr',
  true
)
ON CONFLICT (slug) DO NOTHING;
