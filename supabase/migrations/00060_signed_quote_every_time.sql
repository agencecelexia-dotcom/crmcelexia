-- Le user veut l'email à CHAQUE devis signé (pas seulement le premier)
-- Refonte du trigger : retire la condition "premier" et envoie à chaque transition vers 'signe'

CREATE OR REPLACE FUNCTION on_portal_lead_signed()
RETURNS TRIGGER AS $$
DECLARE
  v_client clients%ROWTYPE;
  v_client_email TEXT;
  v_client_name TEXT;
  v_payload JSONB;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  -- Skip si pas une transition vers 'signe'
  IF NEW.status != 'signe' OR OLD.status = 'signe' THEN RETURN NEW; END IF;

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

-- Update description du template pour refléter le nouveau comportement
UPDATE email_templates
SET description = 'Email à l''artisan client à CHAQUE devis signé (commission Celexia tombe)',
    subject_template = 'Bravo {{client_firstname}} · un nouveau devis signé'
WHERE slug = 'client_first_signed_quote';
