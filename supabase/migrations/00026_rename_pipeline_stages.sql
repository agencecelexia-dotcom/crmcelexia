-- ============================================
-- CRM CELEXIA — Rename pipeline stages
-- Migration 00026
-- ============================================
-- Pipeline: site_a_envoyer → site_envoye → rdv → en_attente_retour → close → perdu / mort

-- Replace the enum entirely (PostgreSQL doesn't support renaming values)
-- 1) Convert to text
ALTER TABLE opportunities ALTER COLUMN status DROP DEFAULT;
ALTER TABLE opportunities ALTER COLUMN status TYPE text USING status::text;

-- 2) Drop old enum and create new one
DROP TYPE opportunity_status;
CREATE TYPE opportunity_status AS ENUM (
  'site_a_envoyer',
  'site_envoye',
  'rdv',
  'en_attente_retour',
  'close',
  'perdu',
  'mort'
);

-- 3) Migrate existing data
UPDATE opportunities SET status = 'site_a_envoyer' WHERE status = 'devis_a_envoyer';
UPDATE opportunities SET status = 'site_envoye'    WHERE status = 'devis_envoye';
UPDATE opportunities SET status = 'rdv'            WHERE status = 'rdv_devis';
UPDATE opportunities SET status = 'close'          WHERE status = 'gagne';
-- 'perdu' stays 'perdu'

-- 4) Cast back to enum with new default
ALTER TABLE opportunities ALTER COLUMN status TYPE opportunity_status USING status::opportunity_status;
ALTER TABLE opportunities ALTER COLUMN status SET DEFAULT 'site_a_envoyer';
