-- Synchronise automatiquement la progression de l'onboarding portail
-- (côté artisan) vers les steps "Accompagnement" affichés au fondateur
-- dans la page détail client.
--
-- Mapping :
--   portal contract_signed         -> accomp contract_signed
--   portal payment_proof_uploaded  -> accomp payment_received
--   portal gmb_access_confirmed    -> accomp gmb_access_shared
--   portal rc_pro_uploaded         -> accomp insurance_received
--
-- (kbis_uploaded n'a pas de mapping direct ; lsa_live reste manuel — c'est
-- l'agence qui le coche quand la campagne est lancée.)

CREATE OR REPLACE FUNCTION sync_portal_to_accompagnement()
RETURNS TRIGGER AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  -- Évite la récursion (cette fonction ne touche pas portal_onboardings)
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- contract_signed
  IF NEW.contract_signed IS DISTINCT FROM OLD.contract_signed THEN
    UPDATE client_accompagnement_steps
    SET completed_at = CASE WHEN NEW.contract_signed THEN COALESCE(completed_at, v_now) ELSE NULL END,
        updated_at = v_now
    WHERE client_id = NEW.client_id AND step = 'contract_signed';
  END IF;

  -- payment_proof_uploaded -> payment_received
  IF NEW.payment_proof_uploaded IS DISTINCT FROM OLD.payment_proof_uploaded THEN
    UPDATE client_accompagnement_steps
    SET completed_at = CASE WHEN NEW.payment_proof_uploaded THEN COALESCE(completed_at, v_now) ELSE NULL END,
        updated_at = v_now
    WHERE client_id = NEW.client_id AND step = 'payment_received';
  END IF;

  -- gmb_access_confirmed -> gmb_access_shared
  IF NEW.gmb_access_confirmed IS DISTINCT FROM OLD.gmb_access_confirmed THEN
    UPDATE client_accompagnement_steps
    SET completed_at = CASE WHEN NEW.gmb_access_confirmed THEN COALESCE(completed_at, v_now) ELSE NULL END,
        updated_at = v_now
    WHERE client_id = NEW.client_id AND step = 'gmb_access_shared';
  END IF;

  -- rc_pro_uploaded -> insurance_received
  IF NEW.rc_pro_uploaded IS DISTINCT FROM OLD.rc_pro_uploaded THEN
    UPDATE client_accompagnement_steps
    SET completed_at = CASE WHEN NEW.rc_pro_uploaded THEN COALESCE(completed_at, v_now) ELSE NULL END,
        updated_at = v_now
    WHERE client_id = NEW.client_id AND step = 'insurance_received';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_portal_to_accompagnement ON portal_onboardings;
CREATE TRIGGER trg_sync_portal_to_accompagnement
  AFTER UPDATE ON portal_onboardings
  FOR EACH ROW
  EXECUTE FUNCTION sync_portal_to_accompagnement();


-- Backfill : pour les clients déjà avancés dans le portail mais dont
-- l'Accompagnement est encore à zéro, on rattrape l'état.
UPDATE client_accompagnement_steps cs
SET completed_at = COALESCE(cs.completed_at, po.contract_signed_at, now()),
    updated_at = now()
FROM portal_onboardings po
WHERE cs.client_id = po.client_id
  AND cs.step = 'contract_signed'
  AND po.contract_signed = true
  AND cs.completed_at IS NULL;

UPDATE client_accompagnement_steps cs
SET completed_at = now(),
    updated_at = now()
FROM portal_onboardings po
WHERE cs.client_id = po.client_id
  AND cs.step = 'payment_received'
  AND po.payment_proof_uploaded = true
  AND cs.completed_at IS NULL;

UPDATE client_accompagnement_steps cs
SET completed_at = COALESCE(cs.completed_at, po.gmb_confirmed_at, now()),
    updated_at = now()
FROM portal_onboardings po
WHERE cs.client_id = po.client_id
  AND cs.step = 'gmb_access_shared'
  AND po.gmb_access_confirmed = true
  AND cs.completed_at IS NULL;

UPDATE client_accompagnement_steps cs
SET completed_at = now(),
    updated_at = now()
FROM portal_onboardings po
WHERE cs.client_id = po.client_id
  AND cs.step = 'insurance_received'
  AND po.rc_pro_uploaded = true
  AND cs.completed_at IS NULL;


-- Realtime : active client_accompagnement_steps pour que la page détail
-- client se mette à jour automatiquement quand le sync se produit.
ALTER PUBLICATION supabase_realtime ADD TABLE client_accompagnement_steps;
