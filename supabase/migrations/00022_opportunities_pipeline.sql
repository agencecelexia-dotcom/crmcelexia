-- ============================================
-- CRM CELEXIA — Opportunities Pipeline Overhaul
-- Migration 00022
-- ============================================
-- Note: opportunities table from migration 00010 was never created in remote DB.
-- This migration creates it from scratch with the new pipeline schema.

-- Drop old enum if it exists (from migration 00010 that may have partially run)
DROP TYPE IF EXISTS opportunity_status CASCADE;

-- Create new enum with pipeline stages
CREATE TYPE opportunity_status AS ENUM (
  'devis_a_envoyer',
  'devis_envoye',
  'rdv_devis',
  'gagne',
  'perdu'
);

-- Create opportunities table with new schema
CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES prospects(id),
  client_id UUID REFERENCES clients(id),
  commercial_id UUID NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL,
  status opportunity_status NOT NULL DEFAULT 'devis_a_envoyer',
  project_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_collected NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_close_date DATE,
  loss_reason TEXT,
  loss_notes TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_opportunities_commercial_id ON opportunities(commercial_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_prospect_id ON opportunities(prospect_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_expected_close_date ON opportunities(expected_close_date);

-- Auto-update updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_opportunities_updated_at'
  ) THEN
    CREATE TRIGGER set_opportunities_updated_at
      BEFORE UPDATE ON opportunities
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- RLS
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can view opportunities' AND tablename = 'opportunities'
  ) THEN
    CREATE POLICY "Users can view opportunities" ON opportunities
      FOR SELECT TO authenticated
      USING (deleted_at IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert opportunities' AND tablename = 'opportunities'
  ) THEN
    CREATE POLICY "Users can insert opportunities" ON opportunities
      FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own opportunities' AND tablename = 'opportunities'
  ) THEN
    CREATE POLICY "Users can update own opportunities" ON opportunities
      FOR UPDATE TO authenticated
      USING (true);
  END IF;
END $$;
