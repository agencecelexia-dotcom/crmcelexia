-- Migration 00107 : Relances automatiques pour avis non cliqués
--
-- Objectif : si un destinataire n'a pas cliqué sur le lien après 3 jours,
-- on lui envoie une relance plus courte. Si toujours pas de clic après 7 jours
-- depuis l'envoi initial, on envoie une 2ème (et dernière) relance.
-- Stop max 3 emails total : initial + relance #1 + relance #2.
--
-- Conditions d'envoi (vérifiées en live par la Edge Function) :
--   - status = 'sent' (pas clicked, pas unsubscribed, pas failed, pas bounced)
--   - clicked_at IS NULL
--   - relance_count < 2
--   - Relance #1 : relance_count = 0 ET sent_at < now() - 3d
--   - Relance #2 : relance_count = 1 ET sent_at < now() - 7d
--
-- Le tracking de click se fait déjà via clicked_at set par
-- public.review_request_click() (page /r/:token). Aucun changement nécessaire
-- côté tracking, on lit juste clicked_at IS NULL.


-- ════════════════════════════════════════════════════════════════════
-- 1. Colonnes de tracking sur review_requests
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE review_requests
  ADD COLUMN IF NOT EXISTS relance_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_relance_at TIMESTAMPTZ;

COMMENT ON COLUMN review_requests.relance_count IS
  'Nombre de relances envoyées (0 = juste l''email initial, max 2).';
COMMENT ON COLUMN review_requests.last_relance_at IS
  'Date du dernier email de relance envoyé. NULL = aucune relance.';

CREATE INDEX IF NOT EXISTS idx_review_requests_relance_eligible
  ON review_requests (sent_at, relance_count)
  WHERE status = 'sent' AND clicked_at IS NULL AND relance_count < 2;


-- ════════════════════════════════════════════════════════════════════
-- 2. Cron pg_cron : appel quotidien à 09h30 UTC (~11h30 Paris été)
-- ════════════════════════════════════════════════════════════════════
--
-- Heure choisie pour que la relance arrive en milieu de matinée Paris.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'review-relance-daily';

SELECT cron.schedule(
  'review-relance-daily',
  '30 9 * * *',
  $$
    SELECT net.http_post(
      url := 'https://zsbrhftzjqqqbwbboyqe.supabase.co/functions/v1/review-relance',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('triggered_by', 'pg_cron_daily'),
      timeout_milliseconds := 120000
    );
  $$
);
