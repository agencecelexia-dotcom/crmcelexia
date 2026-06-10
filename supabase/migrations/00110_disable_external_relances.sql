-- ════════════════════════════════════════════════════════════════════
-- Migration : désactivation des relances externes (vers artisans/clients)
-- ════════════════════════════════════════════════════════════════════
--
-- Date     : 2026-05-31
-- Raison   : plusieurs artisans ont indiqué ne plus vouloir travailler
--            avec Celexia mais continuaient à recevoir des relances
--            automatiques (onboarding pas validé). Décision : couper
--            toutes les automatisations externes de relance, garder
--            uniquement les emails internes + événementiels (confirmation
--            initiale, validation, contrat signé).
--
-- Ce qui est désactivé :
--   - Templates email :
--       portal_onboarding_reminder    (relance artisan pas validé)
--       portal_lead_stale_reminder    (relance leads en attente)
--       rdv_confirmation_reminder     (relance confirmer RDV)
--       rdv_tomorrow                  (rappel J-1 RDV)
--       rdv_trust_builder             (trust building avant RDV)
--   - Cron pg_cron : onboarding-relance-daily
--   - Tous les email_schedule en status pending/scheduled de ces types
--     sont passés à 'cancelled' avec un error_message explicite.
--
-- Ce qui reste actif :
--   - Tous les internal_* (vers agence.celexia@gmail.com)
--   - rdv_confirmation, rdv_cancelled, rdv_noshow, rdv_rescheduled
--     (événements RDV, pas des relances)
--   - portal_invitation (1er email portail, pas relance)
--   - portal_onboarding_validated, portal_contract_signed (notifs positives)
--   - portal_commission_validated, portal_commission_disputed
--   - client_first_signed_quote
--   - portal_onboarding_corrections (admin → artisan, déclenché manuellement)
--   - review-relance-daily (demande d'avis Google, autre sujet)
--
-- Idempotent : la migration peut être ré-appliquée sans casser.
-- Réversible : pour réactiver, faire l'inverse (UPDATE templates +
-- ré-schedule cron via 00104_onboarding_relance_cron.sql).
-- ════════════════════════════════════════════════════════════════════

-- 1. Désactiver les 5 templates de relance
UPDATE email_templates
SET is_active = false,
    updated_at = now()
WHERE slug IN (
  'portal_onboarding_reminder',
  'portal_lead_stale_reminder',
  'rdv_confirmation_reminder',
  'rdv_tomorrow',
  'rdv_trust_builder'
);

-- 2. Annuler tous les email_schedule en attente de ces types
UPDATE email_schedule
SET status = 'cancelled',
    error_message = COALESCE(error_message, '') ||
      ' | désactivé par migration 00110 (relance externe supprimée)'
WHERE status IN ('pending', 'scheduled')
  AND email_type IN (
    'portal_onboarding_reminder',
    'portal_lead_stale_reminder',
    'rdv_confirmation_reminder',
    'rdv_tomorrow',
    'rdv_trust_builder'
  );

-- 3. Déprogrammer le cron pg_cron onboarding-relance-daily
-- (créé par migration 00104_onboarding_relance_cron.sql)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'onboarding-relance-daily') THEN
    PERFORM cron.unschedule('onboarding-relance-daily');
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════
-- Note : les triggers DB qui INSERT dans email_schedule (00072, 00088)
-- continueront à créer des entries de relance, MAIS le sender
-- (send-scheduled-emails) skippera ces types car leurs templates sont
-- is_active=false. C'est volontaire — si on veut un jour réactiver,
-- il suffit de remettre is_active=true sur les templates concernés.
-- ════════════════════════════════════════════════════════════════════
