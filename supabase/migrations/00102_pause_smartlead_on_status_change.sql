-- Migration 00102 : auto-pause Smartlead quand prospect.status passe à un statut
-- "post-conversation" (= le commercial a eu un échange effectif au téléphone).
--
-- Statuts qui DÉCLENCHENT la pause Smartlead (= dialogue effectif) :
--   site_envoye, rdv_pris, a_rappeler, converti_client, perdu, mort,
--   pas_interesse, negatif, refus, hors_cible
--
-- Statuts qui NE DÉCLENCHENT PAS (= appel sans dialogue) :
--   nouveau, messagerie, faux_numero, occupe
--
-- L'edge function `pause-smartlead-lead` est appelée via pg_net (extension
-- HTTP Postgres). Si le lead n'est pas dans Smartlead, rien ne se passe
-- (la fonction l'ignore proprement).

-- Active pg_net si pas déjà
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Liste des statuts qui pausent Smartlead
CREATE OR REPLACE FUNCTION public.is_post_conversation_status(s text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT s IN (
    'site_envoye', 'rdv_pris', 'a_rappeler', 'converti_client',
    'perdu', 'mort', 'pas_interesse', 'negatif', 'refus', 'hors_cible'
  );
$$;

-- Fonction trigger : déclenche l'edge function pause-smartlead-lead
CREATE OR REPLACE FUNCTION public.trigger_pause_smartlead_on_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_request_id bigint;
  v_url text := 'https://zsbrhftzjqqqbwbboyqe.supabase.co/functions/v1/pause-smartlead-lead';
  v_anon_key text;
BEGIN
  -- Garde-fou : ne déclenche que si transition vers un statut "post-conversation"
  -- et que l'ancien statut ne l'était PAS (= vraie transition, pas re-save).
  IF NOT public.is_post_conversation_status(NEW.status) THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT NULL AND public.is_post_conversation_status(OLD.status) THEN
    -- Déjà en post-conversation, pas besoin de re-pauser
    RETURN NEW;
  END IF;

  -- Évite de retrigger si custom_fields.smartlead_paused_at est déjà set
  IF (NEW.custom_fields->>'smartlead_paused_at') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Récupère la clé anon (publique, OK dans trigger)
  v_anon_key := current_setting('app.supabase_anon_key', true);
  IF v_anon_key IS NULL OR v_anon_key = '' THEN
    -- Fallback : appel sans auth header (l'Edge Function est déployée avec --no-verify-jwt)
    v_anon_key := '';
  END IF;

  -- Appelle l'edge function pause-smartlead-lead
  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_anon_key, '')
    ),
    body := jsonb_build_object(
      'prospect_id', NEW.id,
      'reason', 'status_changed:' || COALESCE(OLD.status, 'null') || '_to_' || NEW.status
    ),
    timeout_milliseconds := 10000
  ) INTO v_request_id;

  RAISE NOTICE 'Pause Smartlead triggered for prospect % (request_id %)', NEW.id, v_request_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Ne jamais bloquer l'UPDATE prospect si l'appel HTTP échoue
  RAISE WARNING 'Failed to trigger Smartlead pause: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Trigger AFTER UPDATE OF status
DROP TRIGGER IF EXISTS trg_pause_smartlead_on_status ON prospects;
CREATE TRIGGER trg_pause_smartlead_on_status
AFTER UPDATE OF status ON prospects
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.trigger_pause_smartlead_on_status();

COMMENT ON FUNCTION public.trigger_pause_smartlead_on_status IS
  'Quand un prospect passe en statut post-conversation, pause auto le lead dans Smartlead via Edge Function. Continue la séquence pour messagerie/faux_numero/nouveau.';
