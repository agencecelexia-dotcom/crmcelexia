-- Hardening DB portail artisan (B9 de l'audit)
--
-- M11 — Rate limit emails contract_signed :
--   Un artisan qui re-signe son contrat (bug client, exploit, ou
--   regenerate du PDF) déclencherait un nouvel INSERT email_schedule
--   à chaque update. On ajoute un garde "60 minutes" : si un email
--   portal_contract_signed a déjà été inséré pour cette adresse dans
--   l'heure, on skip silencieusement.
--
-- M12 — Indexes manquants sur portal_onboardings :
--   Un cron Edge Function (futur) qui scan les onboardings inactifs
--   pour envoyer des relances ferait un full table scan. On ajoute
--   2 indexes partiels (uniquement les rows en cours).


-- ════════════════════════════════════════════════════════════════════
-- M11 : rate limit 60 min sur trigger_portal_contract_signed_email
-- ════════════════════════════════════════════════════════════════════
-- On reprend la version 00078 (pg_trigger_depth() guard + recipient_name
-- fallback) et on ajoute le check rate-limit avant l'INSERT.

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
      -- Rate limit : si un email portal_contract_signed a déjà été
      -- inséré pour ce destinataire dans les 60 dernières minutes,
      -- skip silencieusement (le user a déjà reçu / va recevoir).
      IF EXISTS (
        SELECT 1 FROM email_schedule
        WHERE recipient_email = v_email
          AND email_type = 'portal_contract_signed'
          AND created_at > now() - interval '60 minutes'
      ) THEN
        RETURN NEW;
      END IF;

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


-- ════════════════════════════════════════════════════════════════════
-- M12 : indexes partiels sur portal_onboardings pour cron de relances
-- ════════════════════════════════════════════════════════════════════
-- Un futur cron Edge Function va scanner les onboardings "in_progress"
-- pour relancer les artisans inactifs. Sans index, full table scan.

-- Index sur last_activity_at : permet de trouver vite les onboardings
-- en cours sans activité récente.
CREATE INDEX IF NOT EXISTS idx_portal_onb_in_progress_activity
  ON portal_onboardings(last_activity_at)
  WHERE status = 'in_progress' AND reminders_disabled = false;

-- Index sur last_reminder_sent_at : permet de filtrer ceux qui ont déjà
-- reçu une relance récente (pour ne pas spammer).
CREATE INDEX IF NOT EXISTS idx_portal_onb_in_progress_reminder
  ON portal_onboardings(last_reminder_sent_at)
  WHERE status = 'in_progress' AND reminders_disabled = false;
