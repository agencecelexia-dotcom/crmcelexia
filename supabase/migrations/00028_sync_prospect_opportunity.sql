-- ============================================
-- CRM CELEXIA — Sync prospect ↔ opportunity
-- Migration 00028
-- ============================================
-- Problème : les deux pipelines étaient des tables séparées sans connexion vivante.
-- Le seed (00023) était un import unique. Depuis, les nouveaux prospects en
-- site_en_attente n'apparaissaient pas dans le pipe opportunités.
--
-- Solution : deux triggers bidirectionnels + backfill.
--
-- Mapping de statuts :
--   Prospect side        ←→  Opportunity side
--   site_en_attente      ←→  site_a_envoyer
--   site_envoye          ←→  site_envoye
--   rdv_pris             ←→  rdv
--   converti_client      ←→  close
--   perdu                ←→  perdu
--   (pas de match)            en_attente_retour  → rdv_pris
--   (pas de match)            mort               → perdu
-- ============================================


-- ── 1. Prospect → Opportunity (création + sync statut) ──────────────────────

CREATE OR REPLACE FUNCTION sync_prospect_to_opportunity()
RETURNS TRIGGER AS $$
DECLARE
  opp_status opportunity_status;
  existing_opp_id UUID;
BEGIN
  -- Éviter les boucles (triggered depuis opportunity → prospect)
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Seulement pour les statuts qui ont un équivalent dans le pipe opportunité
  IF NEW.status NOT IN ('site_en_attente', 'site_envoye', 'rdv_pris', 'converti_client', 'perdu') THEN
    RETURN NEW;
  END IF;

  -- Mapping prospect → opportunity
  opp_status := CASE NEW.status
    WHEN 'site_en_attente' THEN 'site_a_envoyer'::opportunity_status
    WHEN 'site_envoye'     THEN 'site_envoye'::opportunity_status
    WHEN 'rdv_pris'        THEN 'rdv'::opportunity_status
    WHEN 'converti_client' THEN 'close'::opportunity_status
    WHEN 'perdu'           THEN 'perdu'::opportunity_status
  END;

  -- Chercher une opportunité existante liée à ce prospect (non supprimée)
  SELECT id INTO existing_opp_id
  FROM opportunities
  WHERE prospect_id = NEW.id
    AND deleted_at IS NULL
  LIMIT 1;

  IF existing_opp_id IS NOT NULL THEN
    -- Mettre à jour le statut de l'opportunité existante
    UPDATE opportunities
    SET status = opp_status, updated_at = now()
    WHERE id = existing_opp_id;
  ELSE
    -- Créer une nouvelle opportunité (seulement si commercial assigné)
    IF NEW.commercial_id IS NOT NULL THEN
      INSERT INTO opportunities (
        prospect_id,
        commercial_id,
        name,
        status,
        project_price,
        amount_collected,
        notes,
        created_at
      ) VALUES (
        NEW.id,
        NEW.commercial_id,
        COALESCE(NEW.company_name, 'Opportunité ' || LEFT(NEW.id::text, 8)),
        opp_status,
        1000,
        CASE WHEN NEW.status = 'converti_client' THEN 1000 ELSE 0 END,
        'Créé automatiquement depuis prospect (' || NEW.status || ')',
        now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Supprimer l'ancien trigger s'il existe
DROP TRIGGER IF EXISTS trg_sync_prospect_to_opportunity ON prospects;

CREATE TRIGGER trg_sync_prospect_to_opportunity
  AFTER UPDATE OF status ON prospects
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION sync_prospect_to_opportunity();


-- ── 2. Opportunity → Prospect (sync statut retour) ──────────────────────────

CREATE OR REPLACE FUNCTION sync_opportunity_to_prospect()
RETURNS TRIGGER AS $$
DECLARE
  prospect_status text;
BEGIN
  -- Éviter les boucles
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Pas de prospect lié → rien à faire
  IF NEW.prospect_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Mapping opportunity → prospect
  prospect_status := CASE NEW.status
    WHEN 'site_a_envoyer'    THEN 'site_en_attente'
    WHEN 'site_envoye'       THEN 'site_envoye'
    WHEN 'rdv'               THEN 'rdv_pris'
    WHEN 'en_attente_retour' THEN 'rdv_pris'  -- pas d'équivalent exact, on garde rdv_pris
    WHEN 'close'             THEN 'converti_client'
    WHEN 'perdu'             THEN 'perdu'
    WHEN 'mort'              THEN 'perdu'
    ELSE NULL
  END;

  IF prospect_status IS NOT NULL THEN
    UPDATE prospects
    SET status = prospect_status, updated_at = now()
    WHERE id = NEW.prospect_id
      AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Supprimer l'ancien trigger s'il existe
DROP TRIGGER IF EXISTS trg_sync_opportunity_to_prospect ON opportunities;

CREATE TRIGGER trg_sync_opportunity_to_prospect
  AFTER UPDATE OF status ON opportunities
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION sync_opportunity_to_prospect();


-- ── 3. Backfill : créer les opportunités manquantes ─────────────────────────
-- Pour tous les prospects dans un statut "site" sans opportunité existante.

INSERT INTO opportunities (prospect_id, commercial_id, name, status, project_price, amount_collected, notes, created_at)
SELECT
  p.id,
  p.commercial_id,
  COALESCE(p.company_name, 'Opportunité ' || LEFT(p.id::text, 8)),
  CASE p.status
    WHEN 'site_en_attente' THEN 'site_a_envoyer'::opportunity_status
    WHEN 'site_envoye'     THEN 'site_envoye'::opportunity_status
    WHEN 'rdv_pris'        THEN 'rdv'::opportunity_status
    WHEN 'converti_client' THEN 'close'::opportunity_status
    WHEN 'perdu'           THEN 'perdu'::opportunity_status
  END,
  1000,
  CASE WHEN p.status = 'converti_client' THEN 1000 ELSE 0 END,
  'Backfill auto depuis prospect (' || p.status || ')',
  p.created_at
FROM prospects p
WHERE p.status IN ('site_en_attente', 'site_envoye', 'rdv_pris', 'converti_client', 'perdu')
  AND p.deleted_at IS NULL
  AND p.commercial_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM opportunities o
    WHERE o.prospect_id = p.id
      AND o.deleted_at IS NULL
  );
