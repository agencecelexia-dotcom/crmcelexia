-- ============================================
-- CRM CELEXIA — Seed opportunities from existing prospects
-- Migration 00023
-- ============================================
-- Maps prospect statuses to opportunity pipeline stages:
--   site_en_attente  → devis_a_envoyer
--   site_envoye      → devis_envoye
--   rdv_pris         → rdv_devis
--   converti_client  → gagne
--   perdu            → perdu

INSERT INTO opportunities (prospect_id, commercial_id, name, status, project_price, amount_collected, notes, created_at)
SELECT
  p.id,
  p.commercial_id,
  COALESCE(p.company_name, 'Opportunité ' || LEFT(p.id::text, 8)),
  CASE p.status
    WHEN 'site_en_attente' THEN 'devis_a_envoyer'::opportunity_status
    WHEN 'site_envoye'     THEN 'devis_envoye'::opportunity_status
    WHEN 'rdv_pris'        THEN 'rdv_devis'::opportunity_status
    WHEN 'converti_client' THEN 'gagne'::opportunity_status
    WHEN 'perdu'           THEN 'perdu'::opportunity_status
  END,
  1000,  -- prix par defaut (500 signature + 500 livraison)
  CASE WHEN p.status = 'converti_client' THEN 1000 ELSE 0 END,  -- gagne = tout encaisse
  'Auto-importé depuis prospect (' || p.status || ')',
  p.created_at
FROM prospects p
WHERE p.status IN ('site_en_attente', 'site_envoye', 'rdv_pris', 'converti_client', 'perdu')
  AND p.deleted_at IS NULL
  AND p.commercial_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM opportunities o WHERE o.prospect_id = p.id
  );
