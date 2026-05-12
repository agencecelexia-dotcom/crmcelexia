-- ════════════════════════════════════════════════════════════════════
-- 00097 — Factures du chantier (artisan → son client final)
--
-- Sur la fiche d'un lead signé, l'artisan peut déposer les factures
-- qu'il émet à son client final (acompte, solde, finale). Tracking
-- A→Z du chantier au-delà du devis signé.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS portal_lead_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_lead_id  uuid NOT NULL REFERENCES portal_leads(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id),
  file_path       text NOT NULL,
  file_name       text NOT NULL,
  invoice_type    text NOT NULL
    CHECK (invoice_type IN ('acompte', 'solde', 'finale')),
  amount_ttc      numeric(12,2),
  uploaded_by     uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_lead_invoices_lead
  ON portal_lead_invoices(portal_lead_id) WHERE deleted_at IS NULL;

ALTER TABLE portal_lead_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_invoices_admin_all ON portal_lead_invoices;
CREATE POLICY lead_invoices_admin_all ON portal_lead_invoices
  FOR ALL TO authenticated
  USING (is_founder()) WITH CHECK (is_founder());

DROP POLICY IF EXISTS lead_invoices_artisan_select ON portal_lead_invoices;
CREATE POLICY lead_invoices_artisan_select ON portal_lead_invoices
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL
    AND client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS lead_invoices_artisan_insert ON portal_lead_invoices;
CREATE POLICY lead_invoices_artisan_insert ON portal_lead_invoices
  FOR INSERT TO authenticated
  WITH CHECK (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS lead_invoices_artisan_update ON portal_lead_invoices;
CREATE POLICY lead_invoices_artisan_update ON portal_lead_invoices
  FOR UPDATE TO authenticated
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()))
  WITH CHECK (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

-- RPC soft-delete (le même pattern que 00093 pour contourner les
-- problèmes de RLS WITH CHECK sur UPDATE de deleted_at).
CREATE OR REPLACE FUNCTION public.soft_delete_lead_invoice(invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_invoice portal_lead_invoices%ROWTYPE;
  v_owner_uid uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_invoice FROM portal_lead_invoices WHERE id = invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facture introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_founder() THEN
    SELECT user_id INTO v_owner_uid FROM clients WHERE id = v_invoice.client_id;
    IF v_owner_uid IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Vous n''avez pas accès à cette facture.' USING ERRCODE = '42501';
    END IF;
  END IF;
  UPDATE portal_lead_invoices
     SET deleted_at = COALESCE(deleted_at, now())
   WHERE id = invoice_id;
  RETURN invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_lead_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_lead_invoice(uuid) TO authenticated;
