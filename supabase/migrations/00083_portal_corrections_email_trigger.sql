-- Migration B2 (Critical C7 + High H12/H21) — email "corrections demandées"
-- déclenché automatiquement par la DB au lieu du webhook n8n.
--
-- Avant : le front (admin-onboardings-page + step-validation-dialog) appelait
-- sendOnboardingRejectedEmail → fetch webhook n8n → Resend. Fragile (si n8n
-- est down, l'artisan ne reçoit jamais le motif de correction).
--
-- Après : trigger AFTER UPDATE sur portal_onboardings. Quand rejection_reason
-- bascule de NULL → NOT NULL, on insère un email_schedule de type
-- portal_onboarding_corrections (template déjà existant). La pipeline
-- send-scheduled-emails délivre via Resend en respectant les heures ouvrées.

CREATE OR REPLACE FUNCTION trigger_portal_corrections_email()
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

  -- Fire uniquement quand on POSE un rejection_reason (NULL → non-null ou
  -- changement de motif). Pas de fire sur NULL → NULL ni NOT NULL → NULL
  -- (clear lors d'une re-soumission).
  IF NEW.rejection_reason IS NOT NULL
     AND NEW.rejection_reason <> ''
     AND COALESCE(OLD.rejection_reason, '') <> COALESCE(NEW.rejection_reason, '')
  THEN
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
        'portal_onboarding_corrections',
        now(),
        jsonb_build_object(
          'client_firstname', COALESCE(NULLIF(v_firstname, ''), 'cher artisan'),
          'client_company', COALESCE(NULLIF(v_company, ''), 'votre entreprise'),
          'rejection_reason', NEW.rejection_reason,
          'portal_url', 'https://crmcelexia.vercel.app/portal/auth'
        ),
        'scheduled'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_portal_corrections_email ON portal_onboardings;
CREATE TRIGGER trg_portal_corrections_email
  AFTER UPDATE ON portal_onboardings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_portal_corrections_email();
