-- Quand l'admin valide un onboarding (status → 'validated'), envoie automatiquement
-- l'email "compte activé" à l'artisan via la pipeline email_schedule → Resend.
-- Plus fiable que le webhook n8n qui dépend d'une instance externe.

CREATE OR REPLACE FUNCTION trigger_portal_validated_email()
RETURNS TRIGGER AS $$
DECLARE
  v_email text;
  v_firstname text;
  v_lastname text;
  v_company text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Fire uniquement sur la transition vers 'validated'
  IF NEW.status = 'validated' AND COALESCE(OLD.status, '') <> 'validated' THEN

    SELECT c.contact_email, c.contact_firstname, c.contact_name, c.company_name
      INTO v_email, v_firstname, v_lastname, v_company
      FROM clients c
      WHERE c.id = NEW.client_id;

    IF v_email IS NOT NULL AND v_email <> '' THEN
      INSERT INTO email_schedule (
        recipient_email,
        recipient_name,
        email_type,
        scheduled_at,
        payload,
        status
      ) VALUES (
        v_email,
        COALESCE(
          NULLIF(TRIM(BOTH FROM (COALESCE(v_firstname, '') || ' ' || COALESCE(v_lastname, ''))), ''),
          NULLIF(v_company, ''),
          'Artisan Celexia'
        ),
        'portal_onboarding_validated',
        now(),
        jsonb_build_object(
          'client_firstname', COALESCE(NULLIF(v_firstname, ''), 'cher artisan'),
          'client_company', COALESCE(NULLIF(v_company, ''), 'votre entreprise'),
          'portal_url', 'https://crmcelexia.vercel.app/portal/auth'
        ),
        'scheduled'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_portal_validated_email ON portal_onboardings;
CREATE TRIGGER trg_portal_validated_email
  AFTER UPDATE ON portal_onboardings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_portal_validated_email();
