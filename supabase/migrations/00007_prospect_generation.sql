-- ============================================
-- Prospect Generation Pipeline Support
-- ============================================

-- Add new source type for API-generated prospects
ALTER TYPE prospect_source ADD VALUE IF NOT EXISTS 'api_generation';

-- Add new columns for generated prospects
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS siret TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS siren TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS code_naf TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS niche TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS forme_juridique TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS date_creation_entreprise DATE;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS departement TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS code_postal TEXT;

-- Unique index on siret for deduplication (partial: non-null, non-deleted only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_siret
  ON prospects(siret)
  WHERE siret IS NOT NULL AND deleted_at IS NULL;

-- Index for filtering by niche
CREATE INDEX IF NOT EXISTS idx_prospects_niche
  ON prospects(niche)
  WHERE deleted_at IS NULL AND niche IS NOT NULL;

-- Index for filtering by departement
CREATE INDEX IF NOT EXISTS idx_prospects_departement
  ON prospects(departement)
  WHERE deleted_at IS NULL AND departement IS NOT NULL;
