-- Le trigger sync_prospect_contact_to_client (00049) tente de propager siret/siren
-- depuis prospects vers clients, mais ces colonnes n'existaient pas sur clients.
-- → erreur "column siret of relation client does not exist" sur tout UPDATE prospect.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS siret TEXT,
  ADD COLUMN IF NOT EXISTS siren TEXT;

-- Backfill : copier les siret/siren des prospects existants vers leurs clients liés
UPDATE clients c
SET siret = p.siret, siren = p.siren
FROM prospects p
WHERE c.prospect_id = p.id
  AND c.deleted_at IS NULL
  AND (c.siret IS NULL OR c.siren IS NULL);
