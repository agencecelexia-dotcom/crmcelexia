-- Fix : is_founder() doit aussi retourner TRUE pour le contexte service_role.
--
-- Pourquoi : plusieurs migrations (00046, 00082, 00086, 00087, 00089) ont été
-- écrites en supposant que "service_role bypasse RLS et triggers via is_founder()".
-- C'est faux : service_role bypasse RLS uniquement, pas les triggers. Et
-- is_founder() lit auth.uid() qui retourne NULL en contexte service_role
-- (le JWT service_role n'a pas de claim sub).
--
-- Conséquence du bug :
--   - portal-invite (Edge Function) : UPDATE clients SET user_id, portal_enabled
--     réverti silencieusement par trigger enforce_clients_artisan_invariants
--     → l'artisan n'est jamais réellement lié au client, le portail n'est jamais
--     activé. Symptôme reporté : "j'arrive pas à mettre un client en onboarding".
--   - lsa-leads-sync : leads LSA insérés via Edge Function se voient forcer
--     source='bao' par trigger enforce_portal_leads_artisan_invariants.
--   - Et autres triggers similaires.
--
-- Fix : étendre is_founder() pour reconnaître le rôle JWT service_role via
-- current_setting('request.jwt.claims'). Ce setting est posé par PostgREST sur
-- toutes les requêtes, accessible depuis SECURITY DEFINER, et porte le claim
-- "role":"service_role" pour les appels avec la clé service_role.
--
-- En appels SQL bruts hors PostgREST (cron, psql direct), le setting est absent
-- → COALESCE = '' → check false → comportement actuel (profile lookup).

CREATE OR REPLACE FUNCTION public.is_founder()
RETURNS boolean AS $$
  SELECT
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb->>'role',
      ''
    ) = 'service_role'
    OR public.get_user_role() IN ('fondateur', 'co_fondateur')
$$ LANGUAGE sql SECURITY DEFINER STABLE;
