-- ════════════════════════════════════════════════════════════════════
-- 00096 — Tracking du paiement de commission Celexia par l'artisan
--
-- Flow :
--  1. Lead signé          → commission_status = 'pending'
--  2. Artisan paye + clic → 'declared_paid' (RPC declare_commission_paid)
--     → email auto à agence.celexia@gmail.com
--  3. Fondateur valide    → 'paid'      (RPC validate_commission_payment)
--     → email à l'artisan
--     Fondateur refuse   → 'disputed' + notes
--     → email à l'artisan avec les notes
-- ════════════════════════════════════════════════════════════════════

-- 1) Colonnes -----------------------------------------------------
ALTER TABLE portal_leads
  ADD COLUMN IF NOT EXISTS commission_status text NOT NULL DEFAULT 'pending'
    CHECK (commission_status IN ('pending', 'declared_paid', 'paid', 'disputed')),
  ADD COLUMN IF NOT EXISTS commission_declared_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS commission_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS commission_validated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS commission_admin_notes text;

CREATE INDEX IF NOT EXISTS idx_portal_leads_commission_status
  ON portal_leads(client_id, commission_status)
  WHERE deleted_at IS NULL AND status = 'signe';

-- 2) Étend l'enum email_type --------------------------------------
ALTER TABLE email_schedule DROP CONSTRAINT IF EXISTS email_schedule_email_type_check;
ALTER TABLE email_schedule ADD CONSTRAINT email_schedule_email_type_check
  CHECK (email_type = ANY (ARRAY[
    'rdv_confirmation','rdv_confirmation_reminder','rdv_trust_builder','rdv_tomorrow',
    'rdv_cancelled','rdv_rescheduled','rdv_followup_positive','rdv_noshow',
    'client_welcome','portal_invitation','portal_onboarding_validated',
    'portal_onboarding_corrections','portal_onboarding_reminder',
    'portal_contract_signed','portal_lead_stale_reminder','client_first_signed_quote',
    'internal_devis_signed','internal_rdv_unconfirmed','internal_rdv_confirmed',
    'internal_rdv_cancelled','internal_payment_received','internal_lead_hot',
    'payment_received','invoice_monthly','lead_hot_alert','admin_alert',
    -- NOUVEAUX (00096)
    'internal_commission_declared_paid',
    'portal_commission_validated',
    'portal_commission_disputed'
  ]::text[]));

-- 3) RPC artisan : déclare paiement effectué ---------------------
CREATE OR REPLACE FUNCTION public.declare_commission_paid(lead_id uuid)
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
  SELECT * INTO v_lead FROM portal_leads WHERE id = lead_id;
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
  WHERE id = lead_id;
  RETURN lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.declare_commission_paid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.declare_commission_paid(uuid) TO authenticated;

-- 4) RPC fondateur : valide ou refuse -----------------------------
CREATE OR REPLACE FUNCTION public.validate_commission_payment(
  lead_id uuid,
  approved boolean,
  notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lead portal_leads%ROWTYPE;
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'Réservé aux fondateurs Celexia.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_lead FROM portal_leads WHERE id = lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF v_lead.commission_status <> 'declared_paid' THEN
    RAISE EXCEPTION 'Aucun paiement à valider pour ce lead.';
  END IF;
  UPDATE portal_leads SET
    commission_status = CASE WHEN approved THEN 'paid' ELSE 'disputed' END,
    commission_paid_at = CASE WHEN approved THEN now() ELSE NULL END,
    commission_validated_by = auth.uid(),
    commission_admin_notes = notes
  WHERE id = lead_id;
  RETURN lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_commission_payment(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_commission_payment(uuid, boolean, text) TO authenticated;

-- 5) Trigger emails -----------------------------------------------
CREATE OR REPLACE FUNCTION sync_commission_status_emails()
RETURNS TRIGGER AS $$
DECLARE
  v_client clients%ROWTYPE;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  SELECT * INTO v_client FROM clients WHERE id = NEW.client_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- 5.1 Déclaration paiement → email INTERNE à agence.celexia
  IF NEW.commission_status = 'declared_paid'
     AND COALESCE(OLD.commission_status, '') <> 'declared_paid' THEN
    INSERT INTO email_schedule (
      recipient_email, recipient_name, email_type,
      scheduled_at, payload, status
    ) VALUES (
      'agence.celexia@gmail.com', 'Celexia',
      'internal_commission_declared_paid',
      now() + INTERVAL '1 minute',
      jsonb_build_object(
        'artisan_company', v_client.company_name,
        'artisan_email', v_client.contact_email,
        'artisan_phone', v_client.phone,
        'lead_name', NEW.name,
        'lead_amount', NEW.signed_amount,
        'commission_amount', NEW.commission_amount,
        'commission_base', v_client.commission_base,
        'lead_id', NEW.id,
        'client_id', NEW.client_id
      ),
      'scheduled'
    );
  END IF;

  -- 5.2 Validation founder → email à l'artisan (paid OU disputed)
  IF NEW.commission_status IN ('paid', 'disputed')
     AND OLD.commission_status = 'declared_paid' THEN
    IF v_client.contact_email IS NOT NULL AND v_client.contact_email <> '' THEN
      INSERT INTO email_schedule (
        recipient_email, recipient_name, email_type,
        scheduled_at, payload, status
      ) VALUES (
        v_client.contact_email,
        COALESCE(v_client.contact_firstname, v_client.company_name),
        CASE WHEN NEW.commission_status = 'paid'
          THEN 'portal_commission_validated'
          ELSE 'portal_commission_disputed' END,
        now() + INTERVAL '2 minutes',
        jsonb_build_object(
          'client_firstname', COALESCE(v_client.contact_firstname, v_client.company_name),
          'artisan_company', v_client.company_name,
          'lead_name', NEW.name,
          'commission_amount', NEW.commission_amount,
          'commission_base', v_client.commission_base,
          'notes', NEW.commission_admin_notes
        ),
        'scheduled'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_commission_status_emails ON portal_leads;
CREATE TRIGGER trg_sync_commission_status_emails
  AFTER UPDATE OF commission_status ON portal_leads
  FOR EACH ROW EXECUTE FUNCTION sync_commission_status_emails();

-- 6) Templates email simples (ON CONFLICT pour idempotence) ------
INSERT INTO email_templates (slug, description, subject_template, html_template, is_active)
VALUES
  ('internal_commission_declared_paid',
   'Notif interne agence : un artisan a déclaré avoir payé sa commission',
   '[Celexia] {{artisan_company}} a payé sa commission ({{commission_amount}} €)',
   '<p>Bonjour,</p><p><strong>{{artisan_company}}</strong> ({{artisan_email}}) vient de déclarer avoir payé la commission Celexia pour le lead <strong>{{lead_name}}</strong>.</p><ul><li>Montant signé : {{lead_amount}} € {{commission_base}}</li><li>Commission Celexia : <strong>{{commission_amount}} €</strong></li></ul><p>Vérifiez le virement reçu et validez (ou refusez) dans la carte Accompagnement du client.</p><p>— Système Celexia</p>',
   true),
  ('portal_commission_validated',
   'Confirmation à l''artisan que sa commission a été validée par Celexia',
   '[Celexia] Commission validée — merci !',
   '<p>Bonjour {{client_firstname}},</p><p>Votre paiement de commission Celexia pour le lead <strong>{{lead_name}}</strong> ({{commission_amount}} €) a bien été reçu et validé. Merci !</p><p>— L''équipe Celexia</p>',
   true),
  ('portal_commission_disputed',
   'Notification artisan : sa déclaration de paiement nécessite clarification',
   '[Celexia] Commission à clarifier',
   '<p>Bonjour {{client_firstname}},</p><p>Concernant votre déclaration de paiement de commission pour le lead <strong>{{lead_name}}</strong> ({{commission_amount}} €), nous avons besoin d''une clarification :</p><blockquote>{{notes}}</blockquote><p>Pouvez-vous nous recontacter à agence.celexia@gmail.com ? Merci.</p><p>— L''équipe Celexia</p>',
   true)
ON CONFLICT (slug) DO NOTHING;
