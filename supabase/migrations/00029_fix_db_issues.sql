-- ============================================
-- CRM CELEXIA — Correctifs base de donnees
-- Migration 00029
-- ============================================
-- Cette migration corrige plusieurs problemes identifies :
--   1. Trigger depth bloquant la sync prospect <-> opportunity
--   2. Index manquants sur les cles etrangeres
--   3. Concurrence sur generate_devis_reference
--   4. RLS trop permissive sur opportunities
--   5. Colonne calcom_link potentiellement absente (ordre de migration)


-- ============================================================================
-- FIX 1 : Profondeur de trigger bloquante (CRITIQUE)
-- ============================================================================
-- Probleme : quand log_call_and_update_prospect est appele via RPC, le flux est :
--   1. RPC insere dans calls (depth 0)
--   2. after_call_insert se declenche (depth 1), met a jour prospects.status
--   3. trg_sync_prospect_to_opportunity se declenche (depth 2) mais est BLOQUE
--      par le guard "IF pg_trigger_depth() > 1"
--
-- Solution : changer le guard de > 1 a > 2 dans les deux fonctions de sync.
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_prospect_to_opportunity()
RETURNS TRIGGER AS $$
DECLARE
  opp_status opportunity_status;
  existing_opp_id UUID;
BEGIN
  -- Eviter les boucles (triggered depuis opportunity -> prospect)
  -- On autorise depth 2 pour le cas RPC -> after_call_insert -> sync
  IF pg_trigger_depth() > 2 THEN
    RETURN NEW;
  END IF;

  -- Seulement pour les statuts qui ont un equivalent dans le pipe opportunite
  IF NEW.status NOT IN ('site_en_attente', 'site_envoye', 'rdv_pris', 'converti_client', 'perdu') THEN
    RETURN NEW;
  END IF;

  -- Mapping prospect -> opportunity
  opp_status := CASE NEW.status
    WHEN 'site_en_attente' THEN 'site_a_envoyer'::opportunity_status
    WHEN 'site_envoye'     THEN 'site_envoye'::opportunity_status
    WHEN 'rdv_pris'        THEN 'rdv'::opportunity_status
    WHEN 'converti_client' THEN 'close'::opportunity_status
    WHEN 'perdu'           THEN 'perdu'::opportunity_status
  END;

  -- Chercher une opportunite existante liee a ce prospect (non supprimee)
  SELECT id INTO existing_opp_id
  FROM opportunities
  WHERE prospect_id = NEW.id
    AND deleted_at IS NULL
  LIMIT 1;

  IF existing_opp_id IS NOT NULL THEN
    -- Mettre a jour le statut de l'opportunite existante
    UPDATE opportunities
    SET status = opp_status, updated_at = now()
    WHERE id = existing_opp_id;
  ELSE
    -- Creer une nouvelle opportunite (seulement si commercial assigne)
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
        COALESCE(NEW.company_name, 'Opportunite ' || LEFT(NEW.id::text, 8)),
        opp_status,
        1000,
        CASE WHEN NEW.status = 'converti_client' THEN 1000 ELSE 0 END,
        'Cree automatiquement depuis prospect (' || NEW.status || ')',
        now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION sync_opportunity_to_prospect()
RETURNS TRIGGER AS $$
DECLARE
  prospect_status text;
BEGIN
  -- Eviter les boucles
  -- On autorise depth 2 pour le cas RPC -> after_call_insert -> sync
  IF pg_trigger_depth() > 2 THEN
    RETURN NEW;
  END IF;

  -- Pas de prospect lie -> rien a faire
  IF NEW.prospect_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Mapping opportunity -> prospect
  prospect_status := CASE NEW.status
    WHEN 'site_a_envoyer'    THEN 'site_en_attente'
    WHEN 'site_envoye'       THEN 'site_envoye'
    WHEN 'rdv'               THEN 'rdv_pris'
    WHEN 'en_attente_retour' THEN 'rdv_pris'  -- pas d'equivalent exact, on garde rdv_pris
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


-- ============================================================================
-- FIX 2 : Index manquants sur les cles etrangeres
-- ============================================================================
-- Les FK sans index degradent les performances des JOIN et des cascades DELETE.
-- On utilise CREATE INDEX IF NOT EXISTS pour eviter les erreurs si l'index existe.
-- Note : certains sont deja couverts par des index composites existants, mais un
-- index simple sur la FK seule est preferable pour les lookups directs.
-- ============================================================================

-- prospects
CREATE INDEX IF NOT EXISTS idx_prospects_commercial_id   ON prospects(commercial_id);
CREATE INDEX IF NOT EXISTS idx_prospects_import_id       ON prospects(import_id);

-- clients
CREATE INDEX IF NOT EXISTS idx_clients_commercial_id     ON clients(commercial_id);
CREATE INDEX IF NOT EXISTS idx_clients_prospect_id       ON clients(prospect_id);

-- opportunities (deja existants via 00022, mais IF NOT EXISTS par securite)
CREATE INDEX IF NOT EXISTS idx_opportunities_prospect_id   ON opportunities(prospect_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_commercial_id ON opportunities(commercial_id);

-- devis
CREATE INDEX IF NOT EXISTS idx_devis_client_id           ON devis(client_id);
CREATE INDEX IF NOT EXISTS idx_devis_project_id          ON devis(project_id);
CREATE INDEX IF NOT EXISTS idx_devis_created_by          ON devis(created_by);

-- projects
CREATE INDEX IF NOT EXISTS idx_projects_client_id        ON projects(client_id);

-- calls
CREATE INDEX IF NOT EXISTS idx_calls_prospect_id         ON calls(prospect_id);
CREATE INDEX IF NOT EXISTS idx_calls_commercial_id       ON calls(commercial_id);

-- rendez_vous (la table s'appelle rendez_vous, pas "rdv")
CREATE INDEX IF NOT EXISTS idx_rdv_prospect_id           ON rendez_vous(prospect_id);
CREATE INDEX IF NOT EXISTS idx_rdv_commercial_id         ON rendez_vous(commercial_id);

-- project_notes
CREATE INDEX IF NOT EXISTS idx_project_notes_project_id  ON project_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_project_notes_author_id   ON project_notes(author_id);

-- reminders
CREATE INDEX IF NOT EXISTS idx_reminders_prospect_id     ON reminders(prospect_id);


-- ============================================================================
-- FIX 3 : Concurrence sur generate_devis_reference
-- ============================================================================
-- Probleme : deux INSERT simultanes dans devis peuvent obtenir le meme COUNT(*)
-- et generer une reference dupliquee (ex: DEV-2026-0005 x2).
--
-- Solution : verrouillage consultatif (advisory lock) par mois pour serialiser
-- les lectures de MAX au sein de la meme transaction.
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_devis_reference()
RETURNS TRIGGER AS $$
DECLARE
  v_year TEXT;
  v_count INTEGER;
BEGIN
  -- Verrouillage consultatif pour eviter les doublons en cas d'inserts concurrents
  PERFORM pg_advisory_xact_lock(hashtext('devis_ref_' || to_char(now(), 'YYYYMM')));

  v_year := EXTRACT(YEAR FROM now())::TEXT;

  SELECT COUNT(*) + 1 INTO v_count
  FROM devis
  WHERE reference LIKE 'DEV-' || v_year || '-%';

  NEW.reference := 'DEV-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- FIX 4 : RLS trop permissive sur opportunities
-- ============================================================================
-- Probleme : les policies actuelles permettent a tout utilisateur authentifie de
-- voir et modifier TOUTES les opportunites (USING (true) / USING (deleted_at IS NULL)).
--
-- Solution : aligner sur le pattern utilise pour prospects/calls/reminders :
--   - Les commerciaux ne voient/modifient que leurs propres opportunites
--   - Les fondateurs/co-fondateurs voient tout
--
-- On supprime les anciennes policies et on en cree de nouvelles.
-- ============================================================================

-- Supprimer les anciennes policies permissives
DROP POLICY IF EXISTS "Users can view opportunities" ON opportunities;
DROP POLICY IF EXISTS "Users can insert opportunities" ON opportunities;
DROP POLICY IF EXISTS "Users can update own opportunities" ON opportunities;
DROP POLICY IF EXISTS "Users can delete opportunities" ON opportunities;

-- Nouvelles policies restrictives (meme pattern que prospects dans 00002)
CREATE POLICY "opportunities_select"
  ON opportunities FOR SELECT
  TO authenticated
  USING (is_founder() OR commercial_id = auth.uid());

CREATE POLICY "opportunities_insert"
  ON opportunities FOR INSERT
  TO authenticated
  WITH CHECK (is_founder() OR commercial_id = auth.uid());

CREATE POLICY "opportunities_update"
  ON opportunities FOR UPDATE
  TO authenticated
  USING (is_founder() OR commercial_id = auth.uid())
  WITH CHECK (is_founder() OR commercial_id = auth.uid());

CREATE POLICY "opportunities_delete"
  ON opportunities FOR DELETE
  TO authenticated
  USING (is_founder() OR commercial_id = auth.uid());


-- ============================================================================
-- FIX 5 : Ordre de migration — calcom_link
-- ============================================================================
-- Probleme connu : les migrations 00008 et 00009 font un UPDATE sur
-- company_settings.calcom_link, mais cette colonne n'est creee que dans la
-- migration 00014. En production ces migrations ont deja ete appliquees
-- (dans l'ordre), donc on NE reordonne PAS.
--
-- Par securite, on s'assure que la colonne calcom_link existe sur profiles
-- au cas ou elle aurait ete omise dans un deploiement partiel.
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'calcom_link') THEN
    ALTER TABLE profiles ADD COLUMN calcom_link text;
  END IF;
END $$;
