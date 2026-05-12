-- ════════════════════════════════════════════════════════════════════
-- 00094 — Devis "envoyé" → bumpe le lead lié en status='devis'
--
-- Quand l'artisan marque un devis comme envoyé, son lead doit basculer
-- en 'devis' (s'il était encore 'nouveau' ou 'qualifie'). Sans ça le
-- compteur "Devis envoyés" du dashboard restait à 0 même après envoi.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sync_sent_quote_to_lead()
RETURNS TRIGGER AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  -- Uniquement la transition draft → sent (pas un re-update sent → sent)
  IF NEW.status = 'sent'
     AND COALESCE(OLD.status, '') <> 'sent'
     AND NEW.portal_lead_id IS NOT NULL THEN
    UPDATE portal_leads
       SET status = 'devis', updated_at = now()
     WHERE id = NEW.portal_lead_id
       -- Ne reculer ni signe ni perdu
       AND status IN ('nouveau', 'qualifie');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_sent_quote_to_lead ON quotes;
CREATE TRIGGER trg_sync_sent_quote_to_lead
  AFTER UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION sync_sent_quote_to_lead();
