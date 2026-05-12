-- ════════════════════════════════════════════════════════════════════
-- 00093 — RPCs SECURITY DEFINER pour soft-delete (quotes, portal_leads)
--
-- Contexte : les UPDATE directs (PATCH PostgREST) pour soft-delete
-- échouent avec "new row violates row-level security policy" malgré
-- des policies USING/WITH CHECK qui évaluent à TRUE en test manuel.
-- Origine probable : interaction obscure entre le BEFORE trigger
-- enforce_portal_leads_artisan_invariants et la re-évaluation de RLS
-- sur la NEW row. Plutôt que de creuser un autre mois, on offre une
-- API explicite SECURITY DEFINER qui vérifie l'ownership puis fait
-- l'UPDATE en bypass RLS.
-- ════════════════════════════════════════════════════════════════════

-- ---------- portal_leads ----------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_portal_lead(lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_lead portal_leads%ROWTYPE;
  v_owner_uid uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead FROM portal_leads WHERE id = lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead introuvable.' USING ERRCODE = 'P0002';
  END IF;

  -- Founders : peuvent tout supprimer
  IF NOT public.is_founder() THEN
    -- L'artisan ne peut supprimer QUE ses propres leads BAO
    SELECT user_id INTO v_owner_uid FROM clients WHERE id = v_lead.client_id;
    IF v_owner_uid IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Vous n''avez pas accès à ce lead.' USING ERRCODE = '42501';
    END IF;
    IF v_lead.source = 'lsa' THEN
      RAISE EXCEPTION 'Vous ne pouvez pas supprimer un lead envoyé par Celexia. Mettez plutôt son statut à jour.';
    END IF;
  END IF;

  -- Idempotent : si déjà soft-deleted, on retourne quand même.
  UPDATE portal_leads
     SET deleted_at = COALESCE(deleted_at, now())
   WHERE id = lead_id;

  RETURN lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_portal_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_portal_lead(uuid) TO authenticated;


-- ---------- quotes ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_quote(quote_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_quote quotes%ROWTYPE;
  v_owner_uid uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devis introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_founder() THEN
    SELECT user_id INTO v_owner_uid FROM clients WHERE id = v_quote.client_id;
    IF v_owner_uid IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Vous n''avez pas accès à ce devis.' USING ERRCODE = '42501';
    END IF;
    -- Un devis signé ne peut pas être supprimé côté artisan (lecture seule).
    IF v_quote.status = 'signed' THEN
      RAISE EXCEPTION 'Un devis signé ne peut pas être supprimé.';
    END IF;
  END IF;

  UPDATE quotes
     SET deleted_at = COALESCE(deleted_at, now())
   WHERE id = quote_id;

  RETURN quote_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_quote(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_quote(uuid) TO authenticated;
