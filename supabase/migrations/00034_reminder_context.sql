-- ============================================
-- CRM CELEXIA — Contexte des rappels
-- Migration 00034
-- ============================================
-- Ajoute une colonne context sur la table reminders pour differencier :
--   cold_call   : suivi cold call classique
--   post_site   : suivi apres envoi du site demo
--   post_rdv    : suivi apres un rendez-vous
--   post_perte  : relance d'un prospect perdu (peut-etre plus tard)
--   manuel      : rappel cree manuellement sans contexte specifique

ALTER TABLE reminders ADD COLUMN IF NOT EXISTS context TEXT DEFAULT 'manuel';
