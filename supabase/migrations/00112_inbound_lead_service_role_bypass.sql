-- ════════════════════════════════════════════════════════════════════
-- 00112 — Exempte service_role du trigger portal_leads_artisan_invariants
-- ════════════════════════════════════════════════════════════════════
--
-- Contexte : l'Edge Function `inbound-lead` (00111) crée des leads avec
-- source='site_web' via service_role. Mais le trigger
-- enforce_portal_leads_artisan_invariants (migration 00087) force
-- source='bao' pour tout INSERT non-founder → écrasement silencieux.
--
-- Même pattern que la migration 00103 pour clients : on bypasse pour
-- service_role (= Edge Functions trusted). Les artisans n'ont jamais
-- accès au service_role donc la protection contre les insertions
-- frauduleuses de source='lsa' depuis le portail reste intacte.

CREATE OR REPLACE FUNCTION public.enforce_portal_leads_artisan_invariants()
RETURNS TRIGGER AS $$
BEGIN
  -- Bypass : service_role (Edge Functions). Permet à inbound-lead de
  -- créer des leads source='site_web' sans être réécrit en 'bao'.
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Bypass : founder a tous les droits.
  IF public.is_founder() THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Force source='bao' pour tout INSERT par un artisan via JWT.
    NEW.source := 'bao';
    NEW.commission_rate := COALESCE(NEW.commission_rate, 0);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Soft delete interdit sur leads LSA (lead Celexia non supprimable).
    -- Les leads 'site_web' restent supprimables par l'artisan.
    IF OLD.source = 'lsa'
       AND OLD.deleted_at IS NULL
       AND NEW.deleted_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'Vous ne pouvez pas supprimer un lead envoyé par Celexia. Mettez plutôt son statut à jour.';
    END IF;

    -- L'artisan ne peut pas changer la source ni le rattachement client.
    NEW.source := OLD.source;
    NEW.client_id := OLD.client_id;
    NEW.created_at := OLD.created_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

COMMENT ON FUNCTION public.enforce_portal_leads_artisan_invariants() IS
  'Bloque l''artisan de créer des leads LSA ou de supprimer ceux que Celexia lui a envoyés. Exempte service_role (Edge Function inbound-lead) et founders.';

-- ────────────────────────────────────────────────────────────────────
-- Fix data : le lead de test inséré avant le patch a source='bao'.
-- On le rebascule en 'site_web' pour cohérence (lead 435c9ec0).
-- Aussi : tous les leads créés via la Edge Function avant ce fix.
-- ────────────────────────────────────────────────────────────────────

UPDATE public.portal_leads
SET source = 'site_web'
WHERE source = 'bao'
  AND notes LIKE 'Message du visiteur :%';
