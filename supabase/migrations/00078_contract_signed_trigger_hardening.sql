-- Durcissement du trigger trg_portal_contract_signed_email :
-- 1. pg_trigger_depth() guard pour éviter une double-insertion si un autre
--    trigger ré-update portal_onboardings dans la même transaction.
-- 2. recipient_name : fallback sur la company puis "Artisan Celexia" si vide
--    (évite un name vide dans email_schedule).

CREATE OR REPLACE FUNCTION trigger_portal_contract_signed_email()
RETURNS TRIGGER AS $$
DECLARE
  v_email text;
  v_firstname text;
  v_lastname text;
  v_company text;
  v_filename text;
  v_recipient_name text;
BEGIN
  -- Évite la récursion si un autre trigger ré-update la ligne
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.contract_signed = true
     AND COALESCE(OLD.contract_signed, false) = false
     AND NEW.signed_contract_path IS NOT NULL THEN

    SELECT c.contact_email, c.contact_firstname, c.contact_name, c.company_name
      INTO v_email, v_firstname, v_lastname, v_company
      FROM clients c
      WHERE c.id = NEW.client_id;

    IF v_email IS NOT NULL AND v_email <> '' THEN
      v_filename := 'Contrat-Celexia-'
        || regexp_replace(COALESCE(v_company, 'signe'), '[^a-zA-Z0-9-]', '-', 'g')
        || '.pdf';

      v_recipient_name := COALESCE(
        NULLIF(TRIM(BOTH FROM (COALESCE(v_firstname, '') || ' ' || COALESCE(v_lastname, ''))), ''),
        NULLIF(v_company, ''),
        'Artisan Celexia'
      );

      INSERT INTO email_schedule (
        recipient_email,
        recipient_name,
        email_type,
        scheduled_at,
        payload,
        attachments,
        status
      ) VALUES (
        v_email,
        v_recipient_name,
        'portal_contract_signed',
        now(),
        jsonb_build_object(
          'client_firstname', COALESCE(NULLIF(v_firstname, ''), 'cher artisan'),
          'client_company', COALESCE(NULLIF(v_company, ''), 'votre entreprise')
        ),
        jsonb_build_array(
          jsonb_build_object(
            'filename', v_filename,
            'storage_bucket', 'portal-documents',
            'storage_path', NEW.signed_contract_path,
            'content_type', 'application/pdf'
          )
        ),
        'scheduled'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
