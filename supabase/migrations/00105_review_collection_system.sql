-- Migration 00105 : Système de collecte d'avis Google pour artisans
--
-- Permet à un artisan via son portail de :
--   1. Renseigner son lien de fiche Google (URL d'avis)
--   2. Importer une liste de clients (prénom, nom, email, contexte projet)
--   3. Lancer une campagne email qui les invite à laisser un avis Google
--
-- Workflow :
--   - Artisan crée une campagne via POST front → review_campaigns (draft)
--   - Front insère les destinataires dans review_requests (pending)
--   - Artisan clique "Lancer" → Edge Function send-review-batch
--   - Edge Function envoie via Resend, update status sent
--   - Email contient un lien tracking /r/{token} qui redirige Google
--   - /r/{token} log clicked_at puis 302 vers google_review_url
--
-- Conformité Google : redirection directe vers Google (pas de gating, conforme).
-- Conformité RGPD : footer désabonnement, l'artisan responsable du consentement.


-- ════════════════════════════════════════════════════════════════════
-- 1. review_campaigns
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS review_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT,
  google_review_url TEXT NOT NULL,

  -- Personnalisation email
  custom_subject TEXT,
  custom_intro TEXT,

  -- État
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'launching', 'sent', 'failed', 'cancelled')),

  -- Stats agrégées (rolling)
  total_recipients INT NOT NULL DEFAULT 0,
  total_sent INT NOT NULL DEFAULT 0,
  total_opened INT NOT NULL DEFAULT 0,
  total_clicked INT NOT NULL DEFAULT 0,
  total_failed INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  launched_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_review_campaigns_client
  ON review_campaigns (client_id, created_at DESC)
  WHERE deleted_at IS NULL;


-- ════════════════════════════════════════════════════════════════════
-- 2. review_requests (1 ligne par destinataire de campagne)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES review_campaigns(id) ON DELETE CASCADE,

  recipient_email TEXT NOT NULL,
  recipient_firstname TEXT,
  recipient_name TEXT,
  project_context TEXT,

  -- Token unique pour /r/{token} tracking
  token TEXT NOT NULL UNIQUE
    DEFAULT replace(gen_random_uuid()::text, '-', ''),

  -- État
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'opened', 'clicked', 'failed', 'unsubscribed', 'bounced')),

  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,

  resend_id TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_requests_campaign
  ON review_requests (campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_review_requests_token
  ON review_requests (token);

CREATE INDEX IF NOT EXISTS idx_review_requests_pending
  ON review_requests (campaign_id)
  WHERE status = 'pending';


-- ════════════════════════════════════════════════════════════════════
-- 3. Trigger updated_at
-- ════════════════════════════════════════════════════════════════════

CREATE TRIGGER trg_review_campaigns_updated_at
  BEFORE UPDATE ON review_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_review_requests_updated_at
  BEFORE UPDATE ON review_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ════════════════════════════════════════════════════════════════════
-- 4. RLS — artisan voit ses propres campagnes/requests
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE review_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;

-- review_campaigns
CREATE POLICY review_campaigns_artisan_select
  ON review_campaigns FOR SELECT
  USING (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    OR public.is_founder()
  );

CREATE POLICY review_campaigns_artisan_insert
  ON review_campaigns FOR INSERT
  WITH CHECK (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    OR public.is_founder()
  );

CREATE POLICY review_campaigns_artisan_update
  ON review_campaigns FOR UPDATE
  USING (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    OR public.is_founder()
  )
  WITH CHECK (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    OR public.is_founder()
  );

CREATE POLICY review_campaigns_artisan_delete
  ON review_campaigns FOR DELETE
  USING (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    OR public.is_founder()
  );

-- review_requests
CREATE POLICY review_requests_artisan_select
  ON review_requests FOR SELECT
  USING (
    campaign_id IN (
      SELECT id FROM review_campaigns
      WHERE client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    )
    OR public.is_founder()
  );

CREATE POLICY review_requests_artisan_insert
  ON review_requests FOR INSERT
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM review_campaigns
      WHERE client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    )
    OR public.is_founder()
  );

CREATE POLICY review_requests_artisan_update
  ON review_requests FOR UPDATE
  USING (
    campaign_id IN (
      SELECT id FROM review_campaigns
      WHERE client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    )
    OR public.is_founder()
  );


-- ════════════════════════════════════════════════════════════════════
-- 5. RPC pour la page publique /r/{token} (track click + retourne URL)
-- ════════════════════════════════════════════════════════════════════
--
-- Pattern : SECURITY DEFINER, accessible sans auth (page publique).
-- Retourne google_review_url + log clicked_at.

CREATE OR REPLACE FUNCTION public.review_request_click(p_token TEXT)
RETURNS TABLE (google_review_url TEXT, recipient_firstname TEXT, company_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req_id UUID;
  v_campaign_id UUID;
BEGIN
  -- Récupère le request + log click
  SELECT id, campaign_id INTO v_req_id, v_campaign_id
  FROM review_requests
  WHERE token = p_token;

  IF v_req_id IS NULL THEN
    RETURN; -- token invalide → empty result, front gérera le 404
  END IF;

  -- Log click (1ère fois seulement, idempotent)
  UPDATE review_requests
  SET status = CASE WHEN status = 'pending' THEN 'sent' ELSE status END,
      clicked_at = COALESCE(clicked_at, now()),
      status = CASE WHEN status IN ('pending', 'sent', 'opened') THEN 'clicked' ELSE status END
  WHERE id = v_req_id;

  -- Increment campaign click counter (1ère fois seulement)
  UPDATE review_campaigns rc
  SET total_clicked = total_clicked + 1
  WHERE rc.id = v_campaign_id
    AND NOT EXISTS (
      SELECT 1 FROM review_requests
      WHERE id = v_req_id AND clicked_at < (now() - INTERVAL '1 second')
    );

  -- Return data
  RETURN QUERY
  SELECT rc.google_review_url, rr.recipient_firstname, c.company_name
  FROM review_requests rr
  JOIN review_campaigns rc ON rc.id = rr.campaign_id
  JOIN clients c ON c.id = rc.client_id
  WHERE rr.id = v_req_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_request_click(TEXT) TO anon, authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 6. Unsubscribe RPC (page publique également)
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.review_request_unsubscribe(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  UPDATE review_requests
  SET status = 'unsubscribed', unsubscribed_at = now()
  WHERE token = p_token
  RETURNING recipient_email INTO v_email;

  -- Aussi : on unsubscribe TOUS les futures envois à cet email (toutes campagnes)
  IF v_email IS NOT NULL THEN
    UPDATE review_requests
    SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, now())
    WHERE recipient_email = v_email
      AND status = 'pending';
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_request_unsubscribe(TEXT) TO anon, authenticated;


COMMENT ON TABLE review_campaigns IS
  'Campagnes de collecte d''avis Google lancées par les artisans depuis leur portail.';
COMMENT ON TABLE review_requests IS
  'Demandes d''avis individuelles envoyées par email à un client final. 1 par destinataire.';
