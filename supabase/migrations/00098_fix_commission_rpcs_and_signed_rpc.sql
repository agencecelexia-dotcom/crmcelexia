-- ════════════════════════════════════════════════════════════════════
-- 00098 — Fix P0 audit Cowork
--
-- 1. validate_commission_payment : param `notes` ambigu avec
--    portal_leads.notes (existing column). UPDATE échoue avec
--    "column reference 'notes' is ambiguous". Toute la boucle
--    commission est cassée côté fondateur.
--    Fix : préfixer les params avec p_ pour lever toute ambiguïté.
--
-- 2. declare_commission_paid : rename param par cohérence.
--
-- 3. mark_portal_lead_signed : nouvelle RPC SECURITY DEFINER pour le
--    bouton "Confirmer la signature" sur la fiche lead (l'UPDATE
--    direct sur portal_leads.status='signe' donne 403 RLS — même
--    pattern silencieux que les soft-delete fixés en 00093).
-- ════════════════════════════════════════════════════════════════════

-- Nettoyage des anciennes signatures (PG ne CREATE OR REPLACE pas une
-- fonction si la signature change — il faut DROP d'abord).
DROP FUNCTION IF EXISTS public.declare_commission_paid(uuid);
DROP FUNCTION IF EXISTS public.validate_commission_payment(uuid, boolean, text);

-- ─── declare_commission_paid ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.declare_commission_paid(p_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_lead portal_leads%ROWTYPE;
  v_owner_uid uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_lead FROM portal_leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_founder() THEN
    SELECT user_id INTO v_owner_uid FROM clients WHERE id = v_lead.client_id;
    IF v_owner_uid IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Vous n''avez pas accès à ce lead.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_lead.status <> 'signe' THEN
    RAISE EXCEPTION 'Le lead n''est pas signé.';
  END IF;
  IF v_lead.commission_status <> 'pending' THEN
    RAISE EXCEPTION 'La commission est déjà déclarée ou validée.';
  END IF;
  UPDATE portal_leads SET
    commission_status = 'declared_paid',
    commission_declared_paid_at = now()
  WHERE id = p_lead_id;
  RETURN p_lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.declare_commission_paid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.declare_commission_paid(uuid) TO authenticated;


-- ─── validate_commission_payment ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_commission_payment(
  p_lead_id  uuid,
  p_approved boolean,
  p_notes    text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lead portal_leads%ROWTYPE;
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'Réservé aux fondateurs Celexia.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_lead FROM portal_leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF v_lead.commission_status <> 'declared_paid' THEN
    RAISE EXCEPTION 'Aucun paiement à valider pour ce lead.';
  END IF;
  UPDATE portal_leads SET
    commission_status       = CASE WHEN p_approved THEN 'paid' ELSE 'disputed' END,
    commission_paid_at      = CASE WHEN p_approved THEN now() ELSE NULL END,
    commission_validated_by = auth.uid(),
    commission_admin_notes  = p_notes
  WHERE id = p_lead_id;
  RETURN p_lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_commission_payment(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_commission_payment(uuid, boolean, text) TO authenticated;


-- ─── mark_portal_lead_signed (P1 audit Cowork) ───────────────────
-- Bouton "Confirmer la signature" dans la fiche lead faisait un
-- UPDATE direct sur portal_leads.status='signe' qui plantait en 403
-- RLS (même pattern silencieux que les soft-delete). On bypass via
-- SECURITY DEFINER avec vérif d'ownership stricte.
CREATE OR REPLACE FUNCTION public.mark_portal_lead_signed(
  p_lead_id  uuid,
  p_amount   numeric,
  p_signed_at date DEFAULT CURRENT_DATE
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_lead portal_leads%ROWTYPE;
  v_owner_uid uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié.' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant signé doit être positif.';
  END IF;
  SELECT * INTO v_lead FROM portal_leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_founder() THEN
    SELECT user_id INTO v_owner_uid FROM clients WHERE id = v_lead.client_id;
    IF v_owner_uid IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Vous n''avez pas accès à ce lead.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_lead.status = 'signe' THEN
    RAISE EXCEPTION 'Ce lead est déjà signé.';
  END IF;
  UPDATE portal_leads SET
    status        = 'signe',
    signed_amount = p_amount,
    signed_at     = p_signed_at
  WHERE id = p_lead_id;
  RETURN p_lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_portal_lead_signed(uuid, numeric, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_portal_lead_signed(uuid, numeric, date) TO authenticated;
