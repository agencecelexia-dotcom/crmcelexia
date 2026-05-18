-- Migration 00103 : exempte service_role du trigger enforce_clients_artisan_invariants
--
-- Bug introduit en 00082 (2026-05-11) : le trigger force OLD pour les colonnes
-- sensibles (user_id, portal_enabled, etc.) SAUF si is_founder(). Mais quand
-- l'Edge Function `portal-invite` utilise le service_role pour lier
-- clients.user_id au auth.user nouvellement créé, auth.uid() = NULL,
-- is_founder() = false, et l'UPDATE est SILENCIEUSEMENT reset à OLD.
--
-- Résultat : 5+ artisans (Vincent Turlure, Natur'aqua, Puchaud, etc.) créés
-- depuis le 11 mai ont leur auth.user créé mais clients.user_id = NULL.
-- Ils ne peuvent pas se connecter (RLS bloque), et chaque ré-invite échoue
-- avec "User already registered" car l'auth.user existe.
--
-- Fix : on bypasse le trigger pour service_role (= Edge Functions trusted).
-- Les artisans, eux, n'ont pas accès au service_role — la protection reste.

CREATE OR REPLACE FUNCTION public.enforce_clients_artisan_invariants()
RETURNS TRIGGER AS $$
BEGIN
  -- Bypass : service_role (Edge Functions, scripts admin). Sûr car le
  -- service_role n'est jamais accessible depuis le front artisan.
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Bypass : founder (a tous les droits)
  IF public.is_founder() THEN
    RETURN NEW;
  END IF;

  -- Évite la récursion
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Pour tout autre (= artisan via JWT), force les colonnes sensibles à OLD.
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
  NEW.lsa_business_id := OLD.lsa_business_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

COMMENT ON FUNCTION public.enforce_clients_artisan_invariants() IS
  'Bloque les modifs sensibles côté artisan (user_id, status, commission_*, ...). '
  'Exempte service_role (Edge Functions) et founders. Fix B1 de 00082 + 00103.';
