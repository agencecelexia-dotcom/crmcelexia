-- Migration 00109 : pas de relances le week-end (lun-ven uniquement)
--
-- Contexte : suite à l'envoi de 23 emails de relance onboarding un samedi
-- (24 mai 2026), on durcit la règle : les relances email ne partent
-- QUE du lundi au vendredi. Aucun envoi samedi/dimanche, même si
-- quelqu'un trigger manuellement la fonction.
--
-- Pattern cron : `30 18 * * 1-5` = à 18h30 UTC, lundi (1) à vendredi (5).
-- (0 = dimanche, 6 = samedi → exclus).
--
-- Côté code, les Edge Functions ajoutent un guard supplémentaire qui
-- refuse l'envoi si new Date().getUTCDay() in (0, 6).

-- ════════════════════════════════════════════════════════════════════
-- 1. onboarding-relance-daily : lun-ven seulement
-- ════════════════════════════════════════════════════════════════════

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'onboarding-relance-daily';

SELECT cron.schedule(
  'onboarding-relance-daily',
  '30 18 * * 1-5',
  $$
    SELECT net.http_post(
      url := 'https://zsbrhftzjqqqbwbboyqe.supabase.co/functions/v1/onboarding-relance',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('triggered_by', 'pg_cron_daily'),
      timeout_milliseconds := 120000
    );
  $$
);


-- ════════════════════════════════════════════════════════════════════
-- 2. review-relance-daily : lun-ven seulement
-- ════════════════════════════════════════════════════════════════════

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'review-relance-daily';

SELECT cron.schedule(
  'review-relance-daily',
  '30 9 * * 1-5',
  $$
    SELECT net.http_post(
      url := 'https://zsbrhftzjqqqbwbboyqe.supabase.co/functions/v1/review-relance',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('triggered_by', 'pg_cron_daily'),
      timeout_milliseconds := 120000
    );
  $$
);
