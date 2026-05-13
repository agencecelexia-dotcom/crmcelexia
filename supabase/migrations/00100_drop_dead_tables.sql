-- ════════════════════════════════════════════════════════════════════
-- 00100 — Suppression de 4 tables mortes identifiées par l'audit DB
--
-- Toutes les tables ci-dessous sont à 0 ligne en production, sans
-- aucun trigger PG ni Edge Function qui les alimente. Confirmé par :
--   SELECT COUNT(*) FROM <table>;  → 0
--   FK entrantes : aucune
--
-- 1. `commissions` (legacy admin) — remplacée par portal_leads.commission_*
--    introduit en migration 00096. L'onglet Finances admin et la carte
--    Accompagnement lisent désormais directement portal_leads.
--
-- 2. `budget_payments` — concept de "budget pub avancé par le client",
--    jamais utilisé. Si on en a besoin un jour, on recréera proprement.
--
-- 3. `csv_mapping_presets` — supplanté par csv_imports (active, 9 lignes).
--
-- 4. `project_documents` — never used, le tracking documents passe par
--    portal_documents (onboarding) + portal_quotes (devis + factures).
--
-- DROP idempotent (IF EXISTS) au cas où le rollback partiel.
-- ════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.commissions CASCADE;
DROP TABLE IF EXISTS public.budget_payments CASCADE;
DROP TABLE IF EXISTS public.csv_mapping_presets CASCADE;
DROP TABLE IF EXISTS public.project_documents CASCADE;
