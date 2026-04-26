-- ISSUE-004 : Colonne `phase` calculée dans prospects pour requêtes sémantiques
--
-- L'enum prospect_status mélange 3 phases métier (prospection / pipeline / terminal).
-- Plutôt que de splitter l'enum (refactor risqué qui casserait les triggers
-- bidirectionnels 00028), on ajoute une colonne dérivée `phase` qui permet :
-- - Filtrer `WHERE phase = 'prospection'` au lieu d'énumérer 4 statuts
-- - Construire des dashboards par phase (volume prospection vs pipeline vs terminal)
-- - Conserver intacte la sémantique fine des statuts pour les workflows existants
--
-- La colonne est GENERATED ALWAYS AS ... STORED → maintenue automatiquement par
-- PostgreSQL à chaque INSERT/UPDATE de status. Aucun trigger nécessaire.

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS phase TEXT GENERATED ALWAYS AS (
    CASE
      WHEN status IN ('nouveau', 'messagerie', 'a_rappeler', 'rdv_pris') THEN 'prospection'
      WHEN status IN ('site_en_attente', 'site_envoye') THEN 'pipeline'
      WHEN status IN ('perdu', 'converti_client', 'negatif', 'faux_numero') THEN 'terminal'
      ELSE 'unknown'
    END
  ) STORED;

-- Index partiel sur phase pour filtrage rapide (excluant les soft-deleted)
CREATE INDEX IF NOT EXISTS idx_prospects_phase_active
  ON prospects(phase)
  WHERE deleted_at IS NULL;

-- Index combiné phase + commercial pour les vues commerciales par phase
CREATE INDEX IF NOT EXISTS idx_prospects_phase_commercial_active
  ON prospects(phase, commercial_id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN prospects.phase IS
  'ISSUE-004 : Phase metier derivee du status. Genere automatiquement. Valeurs : prospection, pipeline, terminal, unknown.';
