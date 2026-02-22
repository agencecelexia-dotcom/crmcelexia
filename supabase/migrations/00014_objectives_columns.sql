-- Add cal.com integration field to company_settings
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS calcom_link TEXT DEFAULT '';

-- Add strategic objective columns to commercial_targets
ALTER TABLE commercial_targets ADD COLUMN IF NOT EXISTS target_mrr NUMERIC NOT NULL DEFAULT 5000;
ALTER TABLE commercial_targets ADD COLUMN IF NOT EXISTS target_ca NUMERIC NOT NULL DEFAULT 20000;
ALTER TABLE commercial_targets ADD COLUMN IF NOT EXISTS target_closing_rate NUMERIC NOT NULL DEFAULT 25;
ALTER TABLE commercial_targets ADD COLUMN IF NOT EXISTS target_rdv_rate NUMERIC NOT NULL DEFAULT 10;

-- Allow commercials to upsert their own targets (for objectives page)
CREATE POLICY "targets_upsert_own" ON commercial_targets
  FOR INSERT TO authenticated
  WITH CHECK (commercial_id = auth.uid());

CREATE POLICY "targets_update_own" ON commercial_targets
  FOR UPDATE TO authenticated
  USING (commercial_id = auth.uid());
