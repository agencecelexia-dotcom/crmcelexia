-- Sécurité portail artisan — durcissement RLS (B1 — Critical C6 + High H11)
--
-- C6 : RLS clients trop permissive. Un artisan pouvait UPDATE n'importe quel
-- champ (user_id, portal_enabled, status, opportunity_id, prospect_id...).
-- WITH CHECK existait pour user_id=auth.uid() mais ne couvrait pas les autres.
-- Fix : trigger BEFORE UPDATE qui, si l'utilisateur n'est pas founder, force
-- les colonnes sensibles à leurs anciennes valeurs (pattern de 00046).
--
-- H11 : la policy portal_leads_artisan_update n'avait pas de WITH CHECK.
-- Un artisan pouvait ré-assigner un lead à un autre client (lui appartenant)
-- en faisant UPDATE ... SET client_id = '<autre>'. Le USING vérifie la
-- ligne AVANT, mais sans WITH CHECK la ligne APRÈS est libre.
-- Fix : ajouter WITH CHECK identique au USING.


-- ════════════════════════════════════════════════════════════════════
-- C6 : verrouillage des colonnes sensibles côté artisan sur clients
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_clients_artisan_invariants()
RETURNS TRIGGER AS $$
BEGIN
  -- Si l'utilisateur est founder, il a tous les droits — pas de garde.
  IF public.is_founder() THEN
    RETURN NEW;
  END IF;

  -- Évite la récursion (cette fonction ne ré-UPDATE pas clients)
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Colonnes sensibles : force à OLD si quelqu'un d'autre qu'un founder tente
  -- de les modifier. L'artisan peut toujours modifier les champs "soft"
  -- (contact_*, company_name lisibles, notes éventuelles), mais pas le routing.
  NEW.user_id        := OLD.user_id;
  NEW.portal_enabled := OLD.portal_enabled;
  NEW.portal_activated_at := OLD.portal_activated_at;
  NEW.status         := OLD.status;
  NEW.deleted_at     := OLD.deleted_at;
  NEW.opportunity_id := OLD.opportunity_id;
  NEW.prospect_id    := OLD.prospect_id;
  NEW.commercial_id  := OLD.commercial_id;
  NEW.converted_at   := OLD.converted_at;
  NEW.commission_rate := OLD.commission_rate;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

DROP TRIGGER IF EXISTS trg_enforce_clients_artisan_invariants ON clients;
CREATE TRIGGER trg_enforce_clients_artisan_invariants
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION enforce_clients_artisan_invariants();


-- ════════════════════════════════════════════════════════════════════
-- H11 : WITH CHECK sur portal_leads UPDATE
-- ════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS portal_leads_artisan_update ON portal_leads;

CREATE POLICY portal_leads_artisan_update ON portal_leads
  FOR UPDATE
  USING (
    client_id IN (
      SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()
    )
  )
  WITH CHECK (
    client_id IN (
      SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()
    )
  );
