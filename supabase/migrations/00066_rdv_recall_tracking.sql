-- Refonte UI rdv-list : ajout colonnes pour traçage des rappels post-no-show + concept R1/R2

ALTER TABLE rendez_vous
  ADD COLUMN IF NOT EXISTS recall_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recall_status TEXT
    CHECK (recall_status IN ('not_needed', 'to_do', 'in_progress', 'recovered', 'abandoned')),
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT,
  ADD COLUMN IF NOT EXISTS rdv_index SMALLINT CHECK (rdv_index IN (1, 2));

CREATE INDEX IF NOT EXISTS idx_rdv_recall_status
  ON rendez_vous(recall_status)
  WHERE deleted_at IS NULL AND recall_status IS NOT NULL AND recall_status NOT IN ('recovered', 'abandoned');

-- Trigger : si un RDV passe en 'no_show', set recall_status = 'to_do' automatiquement
-- (ne touche pas si recall_status est déjà set à autre chose — anti-écrasement)
CREATE OR REPLACE FUNCTION on_rdv_noshow_set_recall()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'no_show' AND (OLD.status IS DISTINCT FROM 'no_show') AND NEW.recall_status IS NULL THEN
    NEW.recall_status := 'to_do';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rdv_noshow_recall ON rendez_vous;
CREATE TRIGGER trg_rdv_noshow_recall
  BEFORE UPDATE ON rendez_vous
  FOR EACH ROW
  EXECUTE FUNCTION on_rdv_noshow_set_recall();
