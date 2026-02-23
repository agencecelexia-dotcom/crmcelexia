-- Add recall_date for "mort" opportunities (rappeler plus tard)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS recall_date DATE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS death_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_opportunities_recall_date ON opportunities(recall_date)
  WHERE recall_date IS NOT NULL AND status = 'mort';
