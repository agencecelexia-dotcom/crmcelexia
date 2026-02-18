-- ============================================
-- CRM CELEXIA — Opportunities Table
-- ============================================

CREATE TYPE opportunity_status AS ENUM (
  'qualification',
  'proposition',
  'negociation',
  'closing',
  'gagne',
  'perdu'
);

CREATE TABLE opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES prospects(id),
  client_id UUID REFERENCES clients(id),
  commercial_id UUID NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL,
  status opportunity_status NOT NULL DEFAULT 'qualification',
  estimated_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  probability INTEGER NOT NULL DEFAULT 50 CHECK (probability >= 0 AND probability <= 100),
  projected_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_recurring NUMERIC(12,2),
  expected_close_date DATE,
  loss_reason TEXT,
  loss_notes TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_opportunities_commercial_id ON opportunities(commercial_id);
CREATE INDEX idx_opportunities_prospect_id ON opportunities(prospect_id);
CREATE INDEX idx_opportunities_status ON opportunities(status);
CREATE INDEX idx_opportunities_expected_close_date ON opportunities(expected_close_date);

-- Auto-update updated_at
CREATE TRIGGER set_opportunities_updated_at
  BEFORE UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view opportunities" ON opportunities
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Users can insert opportunities" ON opportunities
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own opportunities" ON opportunities
  FOR UPDATE TO authenticated
  USING (true);
