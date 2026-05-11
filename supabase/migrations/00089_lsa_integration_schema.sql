-- Intégration Google Local Services Ads (LSA) — schéma DB
--
-- Modèle : 1 compte Google (agence.celexia@gmail.com) gère N businesses LSA,
-- 1 par artisan. Chaque business a un ID unique côté Google qu'on mappe
-- vers clients.id côté Celexia.
--
-- Une Edge Function lsa-leads-sync (cron) interroge périodiquement
-- localservices.googleapis.com/v1/detailedLeadReports:search et insère
-- les nouveaux leads dans portal_leads.

-- ════════════════════════════════════════════════════════════════════
-- 1. Mapping client ↔ business LSA
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS lsa_business_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_lsa_business_id
  ON clients (lsa_business_id)
  WHERE lsa_business_id IS NOT NULL;

COMMENT ON COLUMN clients.lsa_business_id IS 'ID Google Local Services du business (artisan). Renseigné côté admin Celexia. Permet à lsa-leads-sync de router les leads vers le bon artisan.';

-- Le trigger enforce_clients_artisan_invariants doit aussi locker ce champ
-- (l'artisan ne doit pas pouvoir modifier son business_id).

CREATE OR REPLACE FUNCTION enforce_clients_artisan_invariants()
RETURNS TRIGGER AS $$
BEGIN
  IF public.is_founder() THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  NEW.user_id        := OLD.user_id;
  NEW.portal_enabled := OLD.portal_enabled;
  NEW.portal_activated_at := OLD.portal_activated_at;
  NEW.status         := OLD.status;
  NEW.deleted_at     := OLD.deleted_at;
  NEW.prospect_id    := OLD.prospect_id;
  NEW.commercial_id  := OLD.commercial_id;
  NEW.converted_at   := OLD.converted_at;
  NEW.commission_rate := OLD.commission_rate;
  NEW.commission_base := OLD.commission_base;
  NEW.lsa_business_id := OLD.lsa_business_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;


-- ════════════════════════════════════════════════════════════════════
-- 2. Métadonnées LSA sur portal_leads
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE portal_leads
  ADD COLUMN IF NOT EXISTS lsa_lead_id text,
  ADD COLUMN IF NOT EXISTS lsa_lead_type text,
  ADD COLUMN IF NOT EXISTS lsa_call_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS lsa_received_at timestamptz;

-- Idempotence : un même lead Google ne peut être inséré qu'une seule fois.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_leads_lsa_lead_id
  ON portal_leads (lsa_lead_id)
  WHERE lsa_lead_id IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'portal_leads_lsa_lead_type_check'
  ) THEN
    ALTER TABLE portal_leads ADD CONSTRAINT portal_leads_lsa_lead_type_check
      CHECK (lsa_lead_type IN ('phone_call', 'message', 'booking') OR lsa_lead_type IS NULL);
  END IF;
END $$;

COMMENT ON COLUMN portal_leads.lsa_lead_id IS 'ID Google du lead (anti-doublon dans la synchro).';
COMMENT ON COLUMN portal_leads.lsa_lead_type IS 'Type Google : phone_call (appel), message, booking.';
COMMENT ON COLUMN portal_leads.lsa_call_duration_seconds IS 'Durée de l''appel en secondes (lsa_lead_type=phone_call).';
COMMENT ON COLUMN portal_leads.lsa_received_at IS 'Timestamp Google de réception du lead côté LSA.';


-- ════════════════════════════════════════════════════════════════════
-- 3. Helper pour upsert d'un lead LSA (utilisé par l'Edge Function)
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION upsert_portal_lead_from_lsa(
  p_lsa_lead_id text,
  p_business_id text,
  p_name text,
  p_phone text,
  p_city text,
  p_work_type text,
  p_lead_type text,
  p_call_duration_seconds integer,
  p_received_at timestamptz
)
RETURNS TABLE (lead_id uuid, was_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id uuid;
  v_existing_id uuid;
  v_new_id uuid;
BEGIN
  -- Résoudre le client à partir du business LSA
  SELECT id INTO v_client_id FROM clients
  WHERE lsa_business_id = p_business_id AND deleted_at IS NULL
  LIMIT 1;

  IF v_client_id IS NULL THEN
    -- Pas de mapping : retourne NULL pour signaler à l'Edge Function de logger
    RETURN QUERY SELECT NULL::uuid, false;
    RETURN;
  END IF;

  -- Idempotence : lead déjà inséré ?
  SELECT id INTO v_existing_id FROM portal_leads
  WHERE lsa_lead_id = p_lsa_lead_id LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Update light (durée d'appel peut arriver après coup)
    UPDATE portal_leads SET
      lsa_call_duration_seconds = COALESCE(p_call_duration_seconds, lsa_call_duration_seconds),
      lsa_received_at = COALESCE(lsa_received_at, p_received_at)
    WHERE id = v_existing_id;
    RETURN QUERY SELECT v_existing_id, false;
    RETURN;
  END IF;

  -- INSERT (le trigger trg_portal_lead_created_event crée l'event auto)
  INSERT INTO portal_leads (
    client_id, name, phone, city, work_type, source, status,
    lsa_lead_id, lsa_lead_type, lsa_call_duration_seconds, lsa_received_at
  ) VALUES (
    v_client_id,
    COALESCE(NULLIF(p_name, ''), 'Prospect Celexia'),
    COALESCE(NULLIF(p_phone, ''), ''),
    p_city,
    COALESCE(NULLIF(p_work_type, ''), '—'),
    'lsa',
    'nouveau',
    p_lsa_lead_id,
    p_lead_type,
    p_call_duration_seconds,
    p_received_at
  )
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT v_new_id, true;
END;
$$;

COMMENT ON FUNCTION upsert_portal_lead_from_lsa IS 'Insère ou met à jour un lead LSA. Idempotent via lsa_lead_id. Renvoie (lead_id, was_new). lead_id NULL si business non mappé.';


-- ════════════════════════════════════════════════════════════════════
-- 4. Patch trigger 00087 : autoriser source='lsa' depuis l'Edge Function
-- ════════════════════════════════════════════════════════════════════
-- L'Edge Function tourne avec service_role qui est founder via is_founder().
-- Donc le trigger 00087 (qui force source='bao' pour non-founder) ne bloque
-- pas l'insert. Pas de changement nécessaire ici, c'est juste documenté.
