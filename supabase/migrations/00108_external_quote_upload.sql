-- Migration 00108 : Permet à l'artisan d'uploader un devis PDF externe
--
-- Use case : l'artisan a généré son devis hors du CRM (Word, Excel, EBP,
-- Sage, etc.) et veut l'attacher à un lead du CRM pour tracker la commission
-- + voir son CA via le portail.
--
-- Workflow attendu côté portail :
--   1. L'artisan choisit un lead (portal_lead) dans son tableau
--   2. Il drag & drop le PDF de son devis
--   3. Il saisit OBLIGATOIREMENT le montant TTC
--   4. Submit → row insérée dans quotes avec is_external=true
--
-- Différence avec un devis "natif" créé via le portail :
--   - Pas de quote_items (les détails des prestations vivent dans le PDF)
--   - total_ttc saisi manuellement (pas calculé par trigger)
--   - external_pdf_path obligatoire (stocké dans bucket portal-quotes)
--
-- Garde-fou DB : check constraint qui force PDF + montant si is_external.


-- ════════════════════════════════════════════════════════════════════
-- 1. Colonnes
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS is_external BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS external_filename TEXT;

COMMENT ON COLUMN quotes.is_external IS
  'true = devis uploadé en PDF par l''artisan (généré hors CRM). false = devis natif créé via l''éditeur portail.';
COMMENT ON COLUMN quotes.external_pdf_path IS
  'Chemin storage du PDF dans bucket portal-quotes. Pattern : {client_id}/external/{quote_id}.pdf';
COMMENT ON COLUMN quotes.external_filename IS
  'Nom original du fichier uploadé (pour affichage UI).';


-- ════════════════════════════════════════════════════════════════════
-- 2. Garde-fou : si is_external = true → exige external_pdf_path + total_ttc > 0
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE quotes
  DROP CONSTRAINT IF EXISTS quotes_external_requires_pdf_and_amount;

ALTER TABLE quotes
  ADD CONSTRAINT quotes_external_requires_pdf_and_amount
  CHECK (
    is_external = false
    OR (external_pdf_path IS NOT NULL AND total_ttc > 0)
  );


-- ════════════════════════════════════════════════════════════════════
-- 3. Trigger : empêche d'avoir des quote_items sur un devis externe
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.prevent_items_on_external_quote()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_external BOOLEAN;
BEGIN
  SELECT is_external INTO v_is_external FROM quotes WHERE id = NEW.quote_id;
  IF v_is_external THEN
    RAISE EXCEPTION 'Cannot add quote_items to an external (uploaded PDF) quote.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_items_on_external_quote ON quote_items;
CREATE TRIGGER trg_prevent_items_on_external_quote
  BEFORE INSERT ON quote_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_items_on_external_quote();


-- ════════════════════════════════════════════════════════════════════
-- 4. Index pour les listings filtrés par source
-- ════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_quotes_external
  ON quotes (client_id, is_external, created_at DESC);
