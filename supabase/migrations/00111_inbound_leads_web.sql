-- ════════════════════════════════════════════════════════════════════
-- 00111 — Inbound leads depuis sites web externes
-- ════════════════════════════════════════════════════════════════════
--
-- Contexte : chaque artisan Celexia (Zachari METBACH en premier) a son
-- propre site web vitrine sur un repo séparé. Quand un visiteur soumet
-- le formulaire de contact, on veut que le lead arrive directement dans
-- le portail artisan du CRM — exactement comme un lead LSA, sauf que
-- la source est étiquetée 'site_web' pour le distinguer visuellement.
--
-- Approche : Edge Function publique `inbound-lead` qui s'authentifie
-- via une clé API (header `X-API-Key`). Chaque clé est rattachée à UN
-- client, ce qui permet à la fonction de savoir dans quel portail
-- créer le lead. Les clés sont stockées hashées (SHA-256) — la clé en
-- clair n'apparaît qu'une seule fois à la génération côté admin.

-- ────────────────────────────────────────────────────────────────────
-- 1. Étend l'enum source pour accepter 'site_web'
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.portal_leads
  DROP CONSTRAINT IF EXISTS portal_leads_source_check;

ALTER TABLE public.portal_leads
  ADD CONSTRAINT portal_leads_source_check
  CHECK (source IN ('lsa', 'bao', 'site_web'));

COMMENT ON COLUMN public.portal_leads.source IS
  'Origine du lead : lsa (Google Local Services), bao (bouche-à-oreille manuel artisan), site_web (formulaire site vitrine via Edge Function inbound-lead).';

-- ────────────────────────────────────────────────────────────────────
-- 2. Table client_api_keys
-- ────────────────────────────────────────────────────────────────────
-- Une clé identifie UN client (= UN artisan = UN portail). On stocke
-- uniquement le hash SHA-256 — impossible de récupérer la clé en clair
-- après création, même en tant qu'admin. Le préfixe (8 premiers chars)
-- est conservé en clair pour permettre à l'admin de reconnaître quelle
-- clé est utilisée dans quel site sans la révéler entièrement.

CREATE TABLE IF NOT EXISTS public.client_api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- Hash SHA-256 de la clé complète (ex `cxa_live_abc...`).
  -- UNIQUE pour permettre lookup direct depuis l'Edge Function.
  key_hash    text NOT NULL UNIQUE,

  -- Les 12 premiers chars de la clé (ex `cxa_live_abc12`) pour
  -- affichage admin et debug. Pas un secret.
  key_prefix  text NOT NULL,

  -- Description libre pour identification ("Site renovation-metbach.fr")
  name        text NOT NULL,

  -- Tracking d'usage pour audit + détection clé inactive
  last_used_at  timestamptz,
  use_count     integer NOT NULL DEFAULT 0,

  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at   timestamptz,
  revoked_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_client_api_keys_client
  ON public.client_api_keys(client_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_client_api_keys_hash
  ON public.client_api_keys(key_hash)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.client_api_keys IS
  'Clés API pour ingestion de leads externes (formulaires sites vitrines artisans). Une clé = un client. Lecture/création réservées aux fondateurs ; l''Edge Function inbound-lead lit via service_role.';

-- ────────────────────────────────────────────────────────────────────
-- 3. RLS : seuls les fondateurs peuvent voir/créer/révoquer
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.client_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "founders_select_api_keys" ON public.client_api_keys;
CREATE POLICY "founders_select_api_keys"
  ON public.client_api_keys
  FOR SELECT
  USING (public.is_founder());

DROP POLICY IF EXISTS "founders_insert_api_keys" ON public.client_api_keys;
CREATE POLICY "founders_insert_api_keys"
  ON public.client_api_keys
  FOR INSERT
  WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "founders_update_api_keys" ON public.client_api_keys;
CREATE POLICY "founders_update_api_keys"
  ON public.client_api_keys
  FOR UPDATE
  USING (public.is_founder())
  WITH CHECK (public.is_founder());

-- Pas de DELETE policy — on garde l'historique, on révoque via update
-- de `revoked_at`. La donnée reste pour audit.

-- ────────────────────────────────────────────────────────────────────
-- 4. RPC pour créer une clé (génère + hash en une seule transaction)
-- ────────────────────────────────────────────────────────────────────
-- L'UI admin n'a pas accès à pgcrypto côté front. Cette RPC :
--   1. génère 32 chars aléatoires avec gen_random_bytes
--   2. compose la clé `cxa_live_<random>`
--   3. hash en SHA-256 → stocke dans key_hash
--   4. retourne la clé EN CLAIR (uniquement à ce moment-là)
--
-- L'admin doit la copier immédiatement — elle n'est plus jamais
-- récupérable après ça.

CREATE OR REPLACE FUNCTION public.generate_client_api_key(
  p_client_id uuid,
  p_name text
) RETURNS TABLE (
  id uuid,
  key_plaintext text,
  key_prefix text
) AS $$
DECLARE
  v_random text;
  v_key text;
  v_hash text;
  v_prefix text;
  v_id uuid;
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'Seul un fondateur peut générer une clé API';
  END IF;

  -- 32 chars hex aléatoires depuis 16 bytes random.
  v_random := encode(gen_random_bytes(16), 'hex');
  v_key := 'cxa_live_' || v_random;
  v_hash := encode(digest(v_key, 'sha256'), 'hex');
  v_prefix := substring(v_key, 1, 12);

  INSERT INTO public.client_api_keys (client_id, key_hash, key_prefix, name, created_by)
  VALUES (p_client_id, v_hash, v_prefix, p_name, auth.uid())
  RETURNING client_api_keys.id INTO v_id;

  RETURN QUERY SELECT v_id, v_key, v_prefix;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

COMMENT ON FUNCTION public.generate_client_api_key IS
  'Génère une nouvelle clé API pour un client. Retourne la clé en clair UNE SEULE FOIS ; ensuite seul le hash est conservé.';

-- pgcrypto est déjà activé par le projet Supabase (extension par défaut).
-- gen_random_bytes vient de pgcrypto, digest aussi.

-- ────────────────────────────────────────────────────────────────────
-- 5. RPC pour incrémenter le compteur d'usage (appelée par Edge Func)
-- ────────────────────────────────────────────────────────────────────
-- L'Edge Function tourne en service_role et appelle cette RPC à chaque
-- lead ingéré pour avoir un compteur atomique. Pas de check de rôle :
-- l'auth se fait via le X-API-Key avant d'arriver ici.

CREATE OR REPLACE FUNCTION public.increment_api_key_use(p_key_id uuid)
RETURNS void AS $$
  UPDATE public.client_api_keys
  SET use_count = use_count + 1,
      last_used_at = now()
  WHERE id = p_key_id;
$$ LANGUAGE sql SECURITY DEFINER;

COMMENT ON FUNCTION public.increment_api_key_use IS
  'Incrémente atomiquement use_count et met à jour last_used_at. Appelée par l''Edge Function inbound-lead après chaque insert réussi.';
