-- Migration 00038: Fix type cast in bidirectional sync triggers
-- The mapped_opp_status TEXT variable needs to be cast to opportunity_status enum

CREATE OR REPLACE FUNCTION sync_prospect_to_opportunity()
RETURNS trigger AS $$
DECLARE
  mapped_opp_status TEXT;
  pre_pipeline BOOLEAN;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  pre_pipeline := NEW.status IN ('nouveau', 'messagerie', 'appele_sans_reponse', 'a_rappeler', 'negatif', 'faux_numero');

  IF pre_pipeline THEN
    UPDATE opportunities
    SET deleted_at = now(), updated_at = now()
    WHERE prospect_id = NEW.id
      AND opportunity_type = 'site_web'
      AND deleted_at IS NULL;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('nouveau', 'messagerie', 'appele_sans_reponse', 'a_rappeler', 'negatif', 'faux_numero')
     AND NOT pre_pipeline THEN
    UPDATE opportunities
    SET deleted_at = NULL, updated_at = now()
    WHERE prospect_id = NEW.id
      AND opportunity_type = 'site_web'
      AND deleted_at IS NOT NULL;
  END IF;

  CASE NEW.status
    WHEN 'site_en_attente'   THEN mapped_opp_status := 'site_a_envoyer';
    WHEN 'site_envoye'       THEN mapped_opp_status := 'site_envoye';
    WHEN 'rdv_pris'          THEN mapped_opp_status := 'rdv';
    WHEN 'converti_client'   THEN mapped_opp_status := 'close';
    WHEN 'perdu'             THEN mapped_opp_status := 'perdu';
    ELSE RETURN NEW;
  END CASE;

  UPDATE opportunities
  SET status = mapped_opp_status::opportunity_status,
      updated_at = now()
  WHERE prospect_id = NEW.id
    AND opportunity_type = 'site_web'
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_opportunity_to_prospect()
RETURNS trigger AS $$
DECLARE
  mapped_prospect_status TEXT;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.opportunity_type != 'site_web' THEN RETURN NEW; END IF;

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
  SET status = mapped_prospect_status::prospect_status,
      updated_at = now()
  WHERE id = NEW.prospect_id
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
