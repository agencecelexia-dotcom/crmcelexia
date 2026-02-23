-- ============================================
-- CRM CELEXIA — Opportunities Pipeline Overhaul
-- Migration 00022
-- ============================================

-- Step 1: Create new enum type with desired stages
CREATE TYPE opportunity_status_new AS ENUM (
  'devis_a_envoyer',
  'devis_envoye',
  'rdv_devis',
  'gagne',
  'perdu'
);

-- Step 2: Migrate existing data
ALTER TABLE opportunities ALTER COLUMN status TYPE text;

UPDATE opportunities SET status = 'devis_a_envoyer' WHERE status = 'qualification';
UPDATE opportunities SET status = 'devis_envoye' WHERE status = 'proposition';
UPDATE opportunities SET status = 'rdv_devis' WHERE status IN ('negociation', 'closing');
-- gagne and perdu remain unchanged

ALTER TABLE opportunities
  ALTER COLUMN status TYPE opportunity_status_new
  USING status::opportunity_status_new;

ALTER TABLE opportunities
  ALTER COLUMN status SET DEFAULT 'devis_a_envoyer';

-- Step 3: Drop old enum, rename new to canonical name
DROP TYPE opportunity_status;
ALTER TYPE opportunity_status_new RENAME TO opportunity_status;

-- Step 4: Add new financial columns
ALTER TABLE opportunities ADD COLUMN project_price NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE opportunities ADD COLUMN amount_collected NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Step 5: Migrate data from estimated_value to project_price
UPDATE opportunities SET project_price = estimated_value;

-- Step 6: Drop deprecated financial columns
ALTER TABLE opportunities DROP COLUMN estimated_value;
ALTER TABLE opportunities DROP COLUMN probability;
ALTER TABLE opportunities DROP COLUMN projected_revenue;
ALTER TABLE opportunities DROP COLUMN monthly_recurring;
