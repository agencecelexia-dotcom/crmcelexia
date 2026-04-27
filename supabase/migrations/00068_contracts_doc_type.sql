-- Étend la table contracts pour gérer plusieurs types de documents (assurance, GMB, etc.)
-- au lieu de la limiter aux contrats commerciaux uniquement.

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS doc_type TEXT NOT NULL DEFAULT 'contract'
    CHECK (doc_type IN ('contract', 'insurance', 'gmb_proof', 'invoice', 'other'));

CREATE INDEX IF NOT EXISTS idx_contracts_doc_type ON contracts(client_id, doc_type) WHERE deleted_at IS NULL;
