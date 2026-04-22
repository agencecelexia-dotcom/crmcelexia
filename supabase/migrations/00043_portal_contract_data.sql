-- Migration 00043: Add contract_data column to portal_onboardings
-- Stores SIREN, SIRET, legal form, etc. collected when admin invites artisan

ALTER TABLE portal_onboardings
  ADD COLUMN IF NOT EXISTS contract_data JSONB;

-- Also add signed_contract_path to store the final signed PDF
ALTER TABLE portal_onboardings
  ADD COLUMN IF NOT EXISTS signed_contract_path TEXT;
