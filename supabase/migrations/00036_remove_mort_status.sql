-- ============================================
-- Remove 'mort' status: merge into 'perdu'
-- ============================================
-- 'mort' value stays in the DB enum (removing it is complex due to RLS/triggers)
-- but is no longer used by the application code.

-- Step 1: Convert all existing mort opportunities to perdu
UPDATE opportunities
SET status = 'perdu', updated_at = now()
WHERE status = 'mort';

-- Step 2: Update sync trigger (remove mort mapping)
CREATE OR REPLACE FUNCTION sync_opportunity_to_prospect()
RETURNS TRIGGER AS $$
DECLARE
  p_status text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.prospect_id IS NULL THEN
    RETURN NEW;
  END IF;

  p_status := CASE NEW.status
    WHEN 'site_a_envoyer'    THEN 'site_en_attente'
    WHEN 'site_envoye'       THEN 'site_envoye'
    WHEN 'rdv'               THEN 'rdv_pris'
    WHEN 'en_attente_retour' THEN 'rdv_pris'
    WHEN 'close'             THEN 'converti_client'
    WHEN 'perdu'             THEN 'perdu'
    ELSE NULL
  END;

  IF p_status IS NOT NULL THEN
    UPDATE prospects
    SET status = p_status::prospect_status, updated_at = now()
    WHERE id = NEW.prospect_id
      AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
