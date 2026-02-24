-- ============================================
-- Fix: sync_opportunity_to_prospect text→enum cast error
-- ============================================
-- Probleme : la migration 00029 a mis le guard des DEUX fonctions de sync a
-- pg_trigger_depth() > 2. Mais sync_opportunity_to_prospect n'a pas besoin de
-- tourner en profondeur 2 (seul sync_prospect_to_opportunity en a besoin pour
-- le flux RPC -> after_call_insert -> prospect update).
--
-- Consequence : quand on met a jour un prospect (ex: site_envoye), la cascade
-- est : prospect UPDATE (depth 0) -> sync_prospect_to_opportunity (depth 1,
-- UPDATE opportunity) -> sync_opportunity_to_prospect (depth 2, tente UPDATE
-- prospect avec variable text -> ERREUR cast text → prospect_status enum).
--
-- Fix : remettre le guard de sync_opportunity_to_prospect a > 1 pour eviter
-- le reverse sync inutile, ET ajouter un cast explicite par securite.

CREATE OR REPLACE FUNCTION sync_opportunity_to_prospect()
RETURNS TRIGGER AS $$
DECLARE
  p_status text;
BEGIN
  -- Eviter les boucles : ne pas re-synchroniser si declenche depuis un trigger
  -- (depth 1 = appel direct, depth 2+ = cascade depuis sync_prospect_to_opportunity)
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Pas de prospect lie -> rien a faire
  IF NEW.prospect_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Mapping opportunity -> prospect
  p_status := CASE NEW.status
    WHEN 'site_a_envoyer'    THEN 'site_en_attente'
    WHEN 'site_envoye'       THEN 'site_envoye'
    WHEN 'rdv'               THEN 'rdv_pris'
    WHEN 'en_attente_retour' THEN 'rdv_pris'  -- pas d'equivalent exact, on garde rdv_pris
    WHEN 'close'             THEN 'converti_client'
    WHEN 'perdu'             THEN 'perdu'
    WHEN 'mort'              THEN 'perdu'
    ELSE NULL
  END;

  IF p_status IS NOT NULL THEN
    UPDATE prospects
    SET status = p_status::prospect_status, updated_at = now()
    WHERE id = NEW.prospect_id
      AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
