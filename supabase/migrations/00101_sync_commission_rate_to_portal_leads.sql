-- ════════════════════════════════════════════════════════════════════
-- 00101 — Sync commission_rate de clients → portal_leads
--
-- Bug critique audit flow (13/05) :
-- portal_leads.commission_rate était figé à 0.10 (default) pour les
-- leads LSA, ALORS QUE clients.commission_rate est issu du contrat
-- signé (peut être 0.08, 0.10, 0.12, etc.).
-- Conséquence : la colonne générée
--   commission_amount = signed_amount * commission_rate
-- est fausse pour tout artisan qui n'est pas à 10 %.
--
-- Aquastyle est à 10 % (coïncidence) — le bug ne se voit pas en démo
-- mais éclate dès qu'un autre artisan arrive.
--
-- ARCHITECTURE :
-- - clients.commission_rate est stocké en POURCENTAGE (ex: 10 pour 10%).
-- - portal_leads.commission_rate est stocké en FRACTION (ex: 0.10 pour 10%).
-- - On divise par 100 lors du sync.
-- ════════════════════════════════════════════════════════════════════

-- ─── Trigger 1 : à l'INSERT/UPDATE d'un lead LSA, sync depuis clients
--    (les leads BAO restent à 0 — pas de commission Celexia dessus)
CREATE OR REPLACE FUNCTION sync_portal_lead_commission_rate_from_client()
RETURNS TRIGGER AS $$
DECLARE v_rate numeric;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  -- Ne touche que les leads LSA non encore signés (préserve l'historique
  -- des leads déjà signés et leurs commission_amount déjà calculés).
  IF NEW.source = 'lsa' AND COALESCE(NEW.status, 'nouveau') <> 'signe' THEN
    SELECT commission_rate INTO v_rate FROM clients WHERE id = NEW.client_id;
    IF v_rate IS NOT NULL THEN
      NEW.commission_rate := v_rate / 100.0;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_portal_lead_commission_rate ON portal_leads;
CREATE TRIGGER trg_sync_portal_lead_commission_rate
  BEFORE INSERT OR UPDATE ON portal_leads
  FOR EACH ROW EXECUTE FUNCTION sync_portal_lead_commission_rate_from_client();

-- ─── Trigger 2 : quand clients.commission_rate change (typiquement
--    via 00086 qui sync contract_data → clients), propager aux leads
--    LSA non encore signés.
CREATE OR REPLACE FUNCTION propagate_client_commission_rate_to_leads()
RETURNS TRIGGER AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.commission_rate IS DISTINCT FROM OLD.commission_rate THEN
    UPDATE portal_leads
       SET commission_rate = NEW.commission_rate / 100.0
     WHERE client_id = NEW.id
       AND source = 'lsa'
       AND status <> 'signe'      -- ne touche pas l'historique signé
       AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_propagate_client_commission_rate ON clients;
CREATE TRIGGER trg_propagate_client_commission_rate
  AFTER UPDATE OF commission_rate ON clients
  FOR EACH ROW EXECUTE FUNCTION propagate_client_commission_rate_to_leads();

-- ─── Backfill : aligner les leads non-signés existants
ALTER TABLE portal_leads DISABLE TRIGGER trg_enforce_portal_leads_artisan_invariants;

UPDATE portal_leads l
   SET commission_rate = c.commission_rate / 100.0
  FROM clients c
 WHERE c.id = l.client_id
   AND l.source = 'lsa'
   AND l.status <> 'signe'
   AND l.deleted_at IS NULL
   AND c.commission_rate IS NOT NULL
   AND l.commission_rate <> c.commission_rate / 100.0;

ALTER TABLE portal_leads ENABLE TRIGGER trg_enforce_portal_leads_artisan_invariants;
