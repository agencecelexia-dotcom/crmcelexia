-- Commercial daily/weekly/monthly targets
CREATE TABLE IF NOT EXISTS commercial_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  calls_per_day INT NOT NULL DEFAULT 50,
  rdv_per_week INT NOT NULL DEFAULT 5,
  conversions_per_month INT NOT NULL DEFAULT 3,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(commercial_id)
);

-- RLS
ALTER TABLE commercial_targets ENABLE ROW LEVEL SECURITY;

-- Commercials can read their own targets
CREATE POLICY "targets_read_own" ON commercial_targets
  FOR SELECT TO authenticated
  USING (commercial_id = auth.uid());

-- Founders can read all
CREATE POLICY "targets_read_founder" ON commercial_targets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('fondateur', 'co_fondateur')
    )
  );

-- Founders can insert/update all
CREATE POLICY "targets_write_founder" ON commercial_targets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('fondateur', 'co_fondateur')
    )
  );
