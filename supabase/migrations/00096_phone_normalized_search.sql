-- ════════════════════════════════════════════════════════════════════
-- 00096 — Recherche par téléphone normalisée
--
-- Problème : la barre de recherche fait `phone.ilike.%input%`. Si la
-- DB stocke "0612345678" et l'utilisateur tape "06 12 34 56 78" (ou
-- inversement), aucun match. Sur ~7700 prospects, 704 stockent encore
-- des espaces ; le reste est clean. La recherche est donc fiable « à
-- moitié », exactement comme l'a constaté l'utilisateur.
--
-- Fix : colonne générée `phone_normalized` (digits-only, +33 → 0)
-- indexée sur prospects et clients. Le front normalise aussi sa
-- search côté JS et l'inclut dans la clause OR.
--
-- normalize_phone() est définie dans 00095 (IMMUTABLE), ce qui permet
-- son usage dans une GENERATED ALWAYS STORED column.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT
  GENERATED ALWAYS AS (public.normalize_phone(phone)) STORED;

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS phone_secondary_normalized TEXT
  GENERATED ALWAYS AS (public.normalize_phone(phone_secondary)) STORED;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT
  GENERATED ALWAYS AS (public.normalize_phone(phone)) STORED;

CREATE INDEX IF NOT EXISTS idx_prospects_phone_normalized
  ON prospects(phone_normalized)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_phone_secondary_normalized
  ON prospects(phone_secondary_normalized)
  WHERE deleted_at IS NULL AND phone_secondary_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_phone_normalized
  ON clients(phone_normalized)
  WHERE deleted_at IS NULL;
