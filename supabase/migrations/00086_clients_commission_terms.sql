-- Suite audit — Commission liée au contrat
--
-- Source de vérité : contract_data JSONB sur portal_onboardings :
--   client_commission_rate (string : "10", "9.5", "8")
--   client_commission_base (string : "HT" ou "TTC")
--
-- Pour faciliter l'accès depuis le front (sans toujours joindre portal_onboardings),
-- on duplique vers clients.commission_rate + commission_base, synchronisé auto.
--
-- Bonus : corrige aussi un bug du trigger 00082 qui référençait
-- clients.opportunity_id (colonne inexistante).


-- ════════════════════════════════════════════════════════════════════
-- 1. Fix d'abord le trigger 00082 (retire opportunity_id qui n'existe pas)
--    Sinon le backfill UPDATE déclencherait une erreur.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_clients_artisan_invariants()
RETURNS TRIGGER AS $$
BEGIN
  IF public.is_founder() THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  NEW.user_id        := OLD.user_id;
  NEW.portal_enabled := OLD.portal_enabled;
  NEW.portal_activated_at := OLD.portal_activated_at;
  NEW.status         := OLD.status;
  NEW.deleted_at     := OLD.deleted_at;
  NEW.prospect_id    := OLD.prospect_id;
  NEW.commercial_id  := OLD.commercial_id;
  NEW.converted_at   := OLD.converted_at;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;


-- ════════════════════════════════════════════════════════════════════
-- 2. Ajout des colonnes
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS commission_rate numeric,
  ADD COLUMN IF NOT EXISTS commission_base text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clients_commission_base_check'
  ) THEN
    ALTER TABLE clients ADD CONSTRAINT clients_commission_base_check
      CHECK (commission_base IN ('HT', 'TTC') OR commission_base IS NULL);
  END IF;
END $$;

COMMENT ON COLUMN clients.commission_rate IS 'Taux de commission en %, ex 10 pour 10%. Source de vérité = portal_onboardings.contract_data.client_commission_rate, sync auto.';
COMMENT ON COLUMN clients.commission_base IS 'Base de calcul : HT ou TTC. Source = contract_data.client_commission_base.';


-- ════════════════════════════════════════════════════════════════════
-- 3. Backfill : extraire les valeurs du contract_data existant
-- ════════════════════════════════════════════════════════════════════

UPDATE clients c
SET
  commission_rate = NULLIF(po.contract_data->>'client_commission_rate', '')::numeric,
  commission_base = NULLIF(po.contract_data->>'client_commission_base', '')
FROM portal_onboardings po
WHERE po.client_id = c.id
  AND po.contract_data IS NOT NULL
  AND c.commission_rate IS NULL;


-- ════════════════════════════════════════════════════════════════════
-- 4. Trigger sync : contract_data change → propager vers clients
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sync_contract_commission_to_client()
RETURNS TRIGGER AS $$
DECLARE
  v_rate numeric;
  v_base text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.contract_data IS NULL THEN
    RETURN NEW;
  END IF;

  v_rate := NULLIF(NEW.contract_data->>'client_commission_rate', '')::numeric;
  v_base := NULLIF(NEW.contract_data->>'client_commission_base', '');

  IF v_rate IS NOT NULL OR v_base IS NOT NULL THEN
    UPDATE clients
    SET
      commission_rate = COALESCE(v_rate, commission_rate),
      commission_base = COALESCE(v_base, commission_base)
    WHERE id = NEW.client_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_contract_commission_to_client ON portal_onboardings;
CREATE TRIGGER trg_sync_contract_commission_to_client
  AFTER INSERT OR UPDATE OF contract_data ON portal_onboardings
  FOR EACH ROW
  EXECUTE FUNCTION sync_contract_commission_to_client();


-- ════════════════════════════════════════════════════════════════════
-- 5. Finalise le trigger clients : maintenant que les colonnes existent,
--    on peut les locker aussi (en plus du fix opportunity_id ci-dessus).
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_clients_artisan_invariants()
RETURNS TRIGGER AS $$
BEGIN
  IF public.is_founder() THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  NEW.user_id        := OLD.user_id;
  NEW.portal_enabled := OLD.portal_enabled;
  NEW.portal_activated_at := OLD.portal_activated_at;
  NEW.status         := OLD.status;
  NEW.deleted_at     := OLD.deleted_at;
  NEW.prospect_id    := OLD.prospect_id;
  NEW.commercial_id  := OLD.commercial_id;
  NEW.converted_at   := OLD.converted_at;
  NEW.commission_rate := OLD.commission_rate;
  NEW.commission_base := OLD.commission_base;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
