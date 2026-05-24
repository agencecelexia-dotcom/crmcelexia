-- Migration 00104 : Automation de relance onboarding artisan
--
-- Trigger : à 20h Paris (= 18h UTC en été, 19h en hiver), un cron appelle
-- l'Edge Function `onboarding-relance` qui :
--   1. Liste les portal_onboardings status NOT IN (validated, rejected, abandoned)
--   2. Filtre ceux où la dernière relance est > 20h ou aucune relance ET portail créé > 5h
--   3. Envoie un email perso via Resend qui liste UNIQUEMENT ce qui manque réellement
--      (lecture en live du portal_onboardings, donc si l'artisan a uploadé son Kbis
--       entre-temps, on ne mentionne plus le Kbis)
--   4. Incrémente relance_count + met à jour last_relance_at
--   5. Au-delà de 14 relances, on stop (futile)
--
-- Email contient :
--   - Identifiants de connexion (email + magic link qui auto-loggue)
--   - Liste dynamique des étapes manquantes
--   - Niveau d'urgence gradué (soft < J5, medium J5-J6, high J7-J8, last J9+)
--
-- Tracking :
--   - portal_onboardings.relance_count : nombre total de relances envoyées
--   - portal_onboardings.last_relance_at : timestamp du dernier envoi
--   - email_logs : 1 ligne par relance envoyée (type = portal_onboarding_relance)


-- ════════════════════════════════════════════════════════════════════
-- 1. Colonnes de tracking
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE portal_onboardings
  ADD COLUMN IF NOT EXISTS relance_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_relance_at TIMESTAMPTZ;

COMMENT ON COLUMN portal_onboardings.relance_count IS
  'Nombre de relances email envoyées par le cron onboarding-relance.';
COMMENT ON COLUMN portal_onboardings.last_relance_at IS
  'Dernière relance email envoyée. NULL = jamais relancé.';

CREATE INDEX IF NOT EXISTS idx_portal_onboardings_relance
  ON portal_onboardings (status, last_relance_at)
  WHERE status NOT IN ('validated', 'rejected', 'abandoned');


-- ════════════════════════════════════════════════════════════════════
-- 2. email_type 'portal_onboarding_relance'
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE email_schedule
  DROP CONSTRAINT IF EXISTS email_schedule_email_type_check;

-- Réinjecte les types existants + le nouveau
DO $$
DECLARE
  existing_types text[];
BEGIN
  -- récupère les types actuellement utilisés
  SELECT array_agg(DISTINCT email_type)
    INTO existing_types
    FROM email_schedule
    WHERE email_type IS NOT NULL;
  -- complète avec les types de référence si pas déjà inclus
  existing_types := existing_types || ARRAY[
    'rdv_confirmation', 'rdv_confirmation_reminder', 'rdv_tomorrow',
    'rdv_trust_builder', 'rdv_noshow', 'portal_invitation',
    'portal_contract_signed', 'portal_lead_stale_reminder',
    'portal_onboarding_relance',
    'internal_rdv_confirmed', 'internal_rdv_cancelled'
  ];
  -- dédoublonne
  SELECT array_agg(DISTINCT t) INTO existing_types FROM unnest(existing_types) t;
  EXECUTE format(
    'ALTER TABLE email_schedule ADD CONSTRAINT email_schedule_email_type_check CHECK (email_type IN (%s))',
    array_to_string(ARRAY(SELECT quote_literal(t) FROM unnest(existing_types) t), ', ')
  );
END $$;


-- ════════════════════════════════════════════════════════════════════
-- 3. Cron pg_cron : appel quotidien à 20h Paris
-- ════════════════════════════════════════════════════════════════════
--
-- pg_cron utilise UTC. 20h Paris = 18h UTC en été (CEST), 19h UTC en hiver (CET).
-- On fixe 18h30 UTC pour viser 20h30 été / 19h30 hiver (compromis simple).
-- Cron : '30 18 * * *' = tous les jours à 18:30 UTC.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Drop ancien job si existe
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'onboarding-relance-daily';

SELECT cron.schedule(
  'onboarding-relance-daily',
  '30 18 * * *',
  $$
    SELECT net.http_post(
      url := 'https://zsbrhftzjqqqbwbboyqe.supabase.co/functions/v1/onboarding-relance',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('triggered_by', 'pg_cron_daily'),
      timeout_milliseconds := 120000
    );
  $$
);

COMMENT ON EXTENSION pg_cron IS
  'Cron Postgres. Job onboarding-relance-daily envoie les relances onboarding tous les jours à 18:30 UTC (~20h30 Paris été, ~19h30 hiver).';
