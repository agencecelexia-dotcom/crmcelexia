-- ISSUE-002 : Cleanup colonnes orphelines recall_date + death_reason
--
-- Migration 00027 avait ajouté ces colonnes pour le statut opportunity 'mort'
-- (rappeler plus tard). La migration 00036 a supprimé le statut 'mort' mais
-- les colonnes sont restées. Audit du code : aucun composant UI ne set
-- death_reason ni recall_date. Les colonnes sont totalement orphelines.

-- Drop l'index partiel WHERE status = 'mort' (devenu invalide après 00036)
DROP INDEX IF EXISTS idx_opportunities_recall_date;

-- Drop les colonnes orphelines
ALTER TABLE opportunities DROP COLUMN IF EXISTS recall_date;
ALTER TABLE opportunities DROP COLUMN IF EXISTS death_reason;
