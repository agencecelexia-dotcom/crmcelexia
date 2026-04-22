-- Empêche un artisan de se valider lui-même (ou de modifier validated_at/validated_by).
-- Seul un fondateur/co_fondateur (ou service_role qui bypasse RLS/triggers) peut marquer un
-- onboarding comme validated.

CREATE OR REPLACE FUNCTION enforce_portal_onboarding_invariants()
RETURNS TRIGGER AS $$
BEGIN
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

DROP TRIGGER IF EXISTS enforce_portal_onb_invariants ON portal_onboardings;
CREATE TRIGGER enforce_portal_onb_invariants
  BEFORE UPDATE ON portal_onboardings
  FOR EACH ROW EXECUTE FUNCTION enforce_portal_onboarding_invariants();
