-- ============================================================================
-- CRM CELEXIA - Migration 00047
-- Optimisation des index FK (partial indexes WHERE deleted_at IS NULL)
-- ============================================================================
-- ISSUE-008
--
-- Probleme :
--   La migration 00029 a cree des index simples sur les FK
--   (idx_opportunities_prospect_id, idx_clients_prospect_id, etc.) sans la
--   clause WHERE deleted_at IS NULL. Or les services TypeScript filtrent
--   quasiment toujours les enregistrements par (fk, deleted_at IS NULL).
--   Resultat : ces index incluent des lignes soft-deleted inutiles, sont
--   plus volumineux, et le planner doit faire un re-check sur deleted_at.
--
-- Solution :
--   Remplacer ces index par des partial indexes "WHERE deleted_at IS NULL"
--   pour les tables agence ayant la colonne deleted_at.
--
-- Tables concernees (avec colonne deleted_at) :
--   - opportunities (prospect_id, commercial_id)
--   - clients       (prospect_id, commercial_id - deja partiel sur commercial)
--   - rendez_vous   (prospect_id, commercial_id - deja partiels)
--   - devis         (client_id, project_id, created_by)
--   - projects      (client_id)
--   - project_notes (project_id, author_id)
--   - prospects     (commercial_id, import_id - deja partiels nominatifs)
--
-- Tables EXCLUES (pas de colonne deleted_at - index simples conserves) :
--   - calls    (table immuable, pas de soft delete)
--   - reminders (pas de soft delete)
--
-- Tables EXCLUES (hors scope ISSUE-008) :
--   - portal_*  (tables portail clients, hors perimetre agence)
--
-- Idempotent : DROP IF EXISTS + CREATE IF NOT EXISTS.
-- Note : les index "..._active" sont nouveaux, ils coexistent avec les
-- anciens index nominatifs (idx_clients_commercial, idx_devis_client, etc.)
-- qui etaient deja partiels dans 00001 - on supprime uniquement les
-- doublons sous-optimaux ajoutes en 00029.
-- ============================================================================


-- ============================================================================
-- OPPORTUNITIES (deleted_at present)
-- ============================================================================
-- L'index idx_opportunities_prospect_id (00029) est tres sollicite par :
--   - opportunity-service.getOpportunityByProspectId (eq prospect_id + is deleted_at null)
--   - prospect-call-panel verifications de doublon pub
--   - reminder-service join sur opportunities
-- Le rendre partiel ameliore lookups + reduit la taille.

DROP INDEX IF EXISTS idx_opportunities_prospect_id;
DROP INDEX IF EXISTS idx_opportunities_commercial_id;

CREATE INDEX IF NOT EXISTS idx_opportunities_prospect_id_active
  ON opportunities(prospect_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_commercial_id_active
  ON opportunities(commercial_id)
  WHERE deleted_at IS NULL;


-- ============================================================================
-- CLIENTS (deleted_at present)
-- ============================================================================
-- idx_clients_commercial deja partiel (00001) - on garde.
-- idx_clients_commercial_id (00029) est redondant ET non partiel - on drop.
-- idx_clients_prospect_id (00029) non partiel - on remplace.

DROP INDEX IF EXISTS idx_clients_prospect_id;
DROP INDEX IF EXISTS idx_clients_commercial_id;

CREATE INDEX IF NOT EXISTS idx_clients_prospect_id_active
  ON clients(prospect_id)
  WHERE deleted_at IS NULL;
-- idx_clients_commercial (partiel) deja present via 00001, pas besoin d'en recreer un.


-- ============================================================================
-- RENDEZ_VOUS (deleted_at present)
-- ============================================================================
-- idx_rdv_prospect deja partiel (00001) - on garde.
-- idx_rdv_commercial deja partiel composite (00001) - on garde.
-- Les variantes "_id" de 00029 sont des doublons non partiels - on drop.

DROP INDEX IF EXISTS idx_rdv_prospect_id;
DROP INDEX IF EXISTS idx_rdv_commercial_id;
-- Pas besoin de recreer : idx_rdv_prospect / idx_rdv_commercial sont deja partiels.


-- ============================================================================
-- DEVIS (deleted_at present)
-- ============================================================================
-- idx_devis_client deja partiel (00001) - on garde.
-- idx_devis_client_id (00029) doublon non partiel - on drop.
-- project_id et created_by n'ont pas d'index partiel - on remplace.

DROP INDEX IF EXISTS idx_devis_client_id;
DROP INDEX IF EXISTS idx_devis_project_id;
DROP INDEX IF EXISTS idx_devis_created_by;

CREATE INDEX IF NOT EXISTS idx_devis_project_id_active
  ON devis(project_id)
  WHERE deleted_at IS NULL AND project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_devis_created_by_active
  ON devis(created_by)
  WHERE deleted_at IS NULL;


-- ============================================================================
-- PROJECTS (deleted_at present)
-- ============================================================================

DROP INDEX IF EXISTS idx_projects_client_id;

CREATE INDEX IF NOT EXISTS idx_projects_client_id_active
  ON projects(client_id)
  WHERE deleted_at IS NULL;


-- ============================================================================
-- PROJECT_NOTES (deleted_at present)
-- ============================================================================

DROP INDEX IF EXISTS idx_project_notes_project_id;
DROP INDEX IF EXISTS idx_project_notes_author_id;

CREATE INDEX IF NOT EXISTS idx_project_notes_project_id_active
  ON project_notes(project_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_notes_author_id_active
  ON project_notes(author_id)
  WHERE deleted_at IS NULL;


-- ============================================================================
-- PROSPECTS (deleted_at present)
-- ============================================================================
-- idx_prospects_import deja partiel (00001) - on garde.
-- idx_prospects_commercial_status deja partiel composite (00001) - on garde.
-- Les variantes "_id" de 00029 sont des doublons non partiels - on drop.
-- (le composite couvre deja le lookup par commercial_id seul via index leftmost)

DROP INDEX IF EXISTS idx_prospects_commercial_id;
DROP INDEX IF EXISTS idx_prospects_import_id;
-- Pas besoin de recreer : idx_prospects_commercial_status (commercial_id, status)
-- couvre les lookups par commercial_id, et idx_prospects_import couvre import_id.


-- ============================================================================
-- CALLS / REMINDERS - PAS de deleted_at, index simples conserves
-- ============================================================================
-- Les index suivants restent inchanges (deja optimaux) :
--   - idx_calls_prospect_id, idx_calls_commercial_id (00029)
--   - idx_calls_prospect, idx_calls_commercial, idx_calls_date (00001)
--   - idx_reminders_prospect_id (00029)
--   - idx_reminders_prospect, idx_reminders_commercial_pending (00001)


-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Apres cette migration, tous les index FK sur tables avec soft delete sont
-- partiels. Gain attendu :
--   - Taille des index reduite proportionnellement aux lignes soft-deleted
--   - Plans d'execution plus precis (planner sait que l'index = lignes actives)
--   - Pas de re-check WHERE deleted_at IS NULL sur des bitmap scans
