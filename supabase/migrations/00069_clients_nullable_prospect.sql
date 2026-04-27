-- Permet la création de clients manuels (sans passer par un prospect du funnel).
-- Les clients créés via convert_prospect_to_client gardent leur prospect_id.

ALTER TABLE clients ALTER COLUMN prospect_id DROP NOT NULL;
