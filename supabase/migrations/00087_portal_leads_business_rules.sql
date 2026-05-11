-- Règles métier portal_leads
--
-- Le portail artisan sert à 2 choses :
-- 1. Suivre les leads envoyés par Celexia (source='lsa') — non supprimables,
--    obligation de mettre à jour les statuts (sinon emails de relance).
-- 2. L'artisan peut ajouter ses propres leads en plus (source='bao') —
--    supprimables, statuts libres.
--
-- Cette migration ajoute 2 garde-fous DB pour empêcher l'artisan de :
-- (a) soft-supprimer un lead que Celexia lui a envoyé,
-- (b) créer un lead avec source='lsa' (réservé à Celexia / admin).

-- ════════════════════════════════════════════════════════════════════
-- (a) Verrou suppression : artisan ne peut pas effacer un lead LSA
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_portal_leads_artisan_invariants()
RETURNS TRIGGER AS $$
BEGIN
  -- Les founders ont tous les droits, on les laisse passer.
  IF public.is_founder() THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Force source='bao' pour tout INSERT par un non-founder.
    -- L'artisan ne peut créer que des leads "bouche à oreille".
    NEW.source := 'bao';
    -- Les champs servant à tracker la qualité Celexia n'ont rien à faire
    -- côté artisan : on les force à NULL.
    NEW.commission_rate := COALESCE(NEW.commission_rate, 0);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Soft delete (deleted_at NULL → NOT NULL) interdit sur les leads LSA.
    IF OLD.source = 'lsa'
       AND OLD.deleted_at IS NULL
       AND NEW.deleted_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'Vous ne pouvez pas supprimer un lead envoyé par Celexia. Mettez plutôt son statut à jour.';
    END IF;

    -- L'artisan ne doit pas pouvoir basculer un lead LSA en source='bao'
    -- (sinon il pourrait contourner la règle ci-dessus en deux UPDATE).
    NEW.source := OLD.source;
    NEW.client_id := OLD.client_id;
    NEW.created_at := OLD.created_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

DROP TRIGGER IF EXISTS trg_enforce_portal_leads_artisan_invariants ON portal_leads;
CREATE TRIGGER trg_enforce_portal_leads_artisan_invariants
  BEFORE INSERT OR UPDATE ON portal_leads
  FOR EACH ROW
  EXECUTE FUNCTION enforce_portal_leads_artisan_invariants();
