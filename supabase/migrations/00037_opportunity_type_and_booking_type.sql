-- Migration 00037: Add opportunity_type to differentiate Site Web vs Pub (LSA)
-- Also adds booking_type to rendez_vous and revenue tracking fields for Pub

-- 1. Create opportunity_type enum
DO $$ BEGIN
  CREATE TYPE opportunity_type AS ENUM ('site_web', 'pub');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add opportunity_type column to opportunities (default site_web for existing data)
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS opportunity_type opportunity_type NOT NULL DEFAULT 'site_web';

-- 3. Add revenue tracking for Pub (LSA) — 10% commission model
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS revenue_generated NUMERIC(12,2) DEFAULT 0;

-- 4. Add booking_type to rendez_vous to distinguish site vs pub bookings
ALTER TABLE rendez_vous
  ADD COLUMN IF NOT EXISTS booking_type opportunity_type;

-- 5. Index on opportunity_type for fast filtering
CREATE INDEX IF NOT EXISTS idx_opportunities_type ON opportunities (opportunity_type);

-- 6. Index on booking_type for rendez_vous
CREATE INDEX IF NOT EXISTS idx_rdv_booking_type ON rendez_vous (booking_type);

-- 7. Update bidirectional sync trigger: only sync site_web opportunities with prospect status
-- Replace the trigger function from 00028/00035 to be type-aware
CREATE OR REPLACE FUNCTION sync_opportunity_to_prospect()
RETURNS trigger AS $$
DECLARE
  mapped_prospect_status TEXT;
BEGIN
  -- Guard against infinite loops
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  -- Only sync site_web opportunities (pub has its own independent flow)
  IF NEW.opportunity_type != 'site_web' THEN RETURN NEW; END IF;

  -- Map opportunity status to prospect status
  CASE NEW.status
    WHEN 'site_a_envoyer' THEN mapped_prospect_status := 'site_en_attente';
    WHEN 'site_envoye'    THEN mapped_prospect_status := 'site_envoye';
    WHEN 'rdv'            THEN mapped_prospect_status := 'rdv_pris';
    WHEN 'en_attente_retour' THEN mapped_prospect_status := 'rdv_pris';
    WHEN 'close'          THEN mapped_prospect_status := 'converti_client';
    WHEN 'perdu'          THEN mapped_prospect_status := 'perdu';
    ELSE RETURN NEW;
  END CASE;

  UPDATE prospects
  SET status = mapped_prospect_status,
      updated_at = now()
  WHERE id = NEW.prospect_id
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Update prospect-to-opportunity sync: only affect site_web opportunities
CREATE OR REPLACE FUNCTION sync_prospect_to_opportunity()
RETURNS trigger AS $$
DECLARE
  mapped_opp_status TEXT;
  pre_pipeline BOOLEAN;
BEGIN
  -- Guard against infinite loops
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  -- Check if prospect moved to a pre-pipeline status
  pre_pipeline := NEW.status IN ('nouveau', 'messagerie', 'appele_sans_reponse', 'a_rappeler', 'negatif', 'faux_numero');

  -- Soft-delete site_web opportunities when prospect goes back to pre-pipeline
  IF pre_pipeline THEN
    UPDATE opportunities
    SET deleted_at = now(), updated_at = now()
    WHERE prospect_id = NEW.id
      AND opportunity_type = 'site_web'
      AND deleted_at IS NULL;
    RETURN NEW;
  END IF;

  -- Restore soft-deleted site_web opportunities when prospect re-enters pipeline
  IF OLD.status IN ('nouveau', 'messagerie', 'appele_sans_reponse', 'a_rappeler', 'negatif', 'faux_numero')
     AND NOT pre_pipeline THEN
    UPDATE opportunities
    SET deleted_at = NULL, updated_at = now()
    WHERE prospect_id = NEW.id
      AND opportunity_type = 'site_web'
      AND deleted_at IS NOT NULL;
  END IF;

  -- Map prospect status to opportunity status
  CASE NEW.status
    WHEN 'site_en_attente'   THEN mapped_opp_status := 'site_a_envoyer';
    WHEN 'site_envoye'       THEN mapped_opp_status := 'site_envoye';
    WHEN 'rdv_pris'          THEN mapped_opp_status := 'rdv';
    WHEN 'converti_client'   THEN mapped_opp_status := 'close';
    WHEN 'perdu'             THEN mapped_opp_status := 'perdu';
    ELSE RETURN NEW;
  END CASE;

  UPDATE opportunities
  SET status = mapped_opp_status,
      updated_at = now()
  WHERE prospect_id = NEW.id
    AND opportunity_type = 'site_web'
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
