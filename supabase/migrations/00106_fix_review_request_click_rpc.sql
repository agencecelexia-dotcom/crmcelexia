-- Migration 00106 : fix RPC review_request_click
--
-- Bug 00105 : l'UPDATE de review_request_click avait 2 assignments à la
-- même colonne `status` dans le même SET, ce qui fait planter PostgreSQL
-- avec "multiple assignments to same column status" (code 42601).
-- Conséquence : tous les clics sur les liens d'emails plantaient et les
-- destinataires voyaient une page d'erreur au lieu de la redirection Google.
--
-- Fix : 1 seule assignment de status, logique CASE consolidée.
-- Aussi : simplification du compteur total_clicked (était inutilement
-- complexe avec un EXISTS qui ne fonctionnait pas correctement).

CREATE OR REPLACE FUNCTION public.review_request_click(p_token TEXT)
RETURNS TABLE (google_review_url TEXT, recipient_firstname TEXT, company_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req_id UUID;
  v_campaign_id UUID;
  v_was_first_click BOOLEAN := false;
BEGIN
  -- Récupère le request + check si premier click (clicked_at IS NULL)
  SELECT id, campaign_id, (clicked_at IS NULL)
  INTO v_req_id, v_campaign_id, v_was_first_click
  FROM review_requests
  WHERE token = p_token;

  IF v_req_id IS NULL THEN
    RETURN; -- token invalide → empty result, le front gère le 404
  END IF;

  -- Update du request : 1 seule assignment de status.
  -- Préserve les status terminaux (failed/unsubscribed/bounced).
  -- Sinon → 'clicked'. Garde clicked_at de la première fois.
  UPDATE review_requests
  SET clicked_at = COALESCE(clicked_at, now()),
      status = CASE
        WHEN status IN ('failed', 'unsubscribed', 'bounced') THEN status
        ELSE 'clicked'
      END
  WHERE id = v_req_id;

  -- Increment total_clicked sur la campagne (seulement au premier click)
  IF v_was_first_click THEN
    UPDATE review_campaigns
    SET total_clicked = total_clicked + 1
    WHERE id = v_campaign_id;
  END IF;

  -- Return les data nécessaires au front pour la redirection
  RETURN QUERY
  SELECT rc.google_review_url, rr.recipient_firstname, c.company_name
  FROM review_requests rr
  JOIN review_campaigns rc ON rc.id = rr.campaign_id
  JOIN clients c ON c.id = rc.client_id
  WHERE rr.id = v_req_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_request_click(TEXT) TO anon, authenticated;
