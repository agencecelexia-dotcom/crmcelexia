-- Empêche la bascule vers 'pending_validation' si l'une des 4 étapes
-- d'onboarding n'est pas complétée. La soumission est désormais déclenchée
-- explicitement depuis la page Welcome (et non plus implicitement à la fin
-- de l'étape Legal), donc le client peut faire les étapes dans n'importe
-- quel ordre. Ce garde-fou DB protège contre les bypass via API directe.

CREATE OR REPLACE FUNCTION enforce_portal_onboarding_invariants()
RETURNS TRIGGER AS $$
BEGIN
  -- Bascule vers 'pending_validation' : exige les 4 étapes complétées
  IF NEW.status = 'pending_validation' AND OLD.status IS DISTINCT FROM 'pending_validation' THEN
    IF NOT (
      NEW.contract_signed
      AND NEW.payment_proof_uploaded
      AND NEW.gmb_access_confirmed
      AND NEW.rc_pro_uploaded
      AND NEW.kbis_uploaded
    ) THEN
      RAISE EXCEPTION 'Toutes les étapes (contrat, virement, GMB, RC Pro, Kbis) doivent être complétées avant la soumission';
    END IF;
  END IF;

  -- Bascule vers 'validated' → réservé à l'admin
  IF NEW.status = 'validated' AND (OLD.status IS DISTINCT FROM 'validated') THEN
    IF NOT public.is_founder() THEN
      RAISE EXCEPTION 'Seul un administrateur peut valider un onboarding';
    END IF;
  END IF;

  -- Champs validated_at / validated_by : réservés à l'admin
  IF NOT public.is_founder() THEN
    IF NEW.validated_at IS DISTINCT FROM OLD.validated_at THEN
      NEW.validated_at := OLD.validated_at;
    END IF;
    IF NEW.validated_by IS DISTINCT FROM OLD.validated_by THEN
      NEW.validated_by := OLD.validated_by;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
