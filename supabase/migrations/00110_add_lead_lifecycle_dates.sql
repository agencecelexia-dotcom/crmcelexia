-- Migration 00110 : Dates de cycle de vie projet pour timeline unifiée
--
-- Contexte : audit V3 a identifié 3 dates manquantes pour la timeline
-- projet unifiée dans /portal/leads/:id. Aujourd'hui l'artisan fait 3-4
-- allers-retours entre /portal/leads, /portal/devis, /portal/commission
-- pour reconstituer l'état d'un dossier. Avec ces 3 colonnes la timeline
-- couvre les 8 étapes de bout en bout.
--
-- Aucun downtime, aucun backfill : toutes les colonnes sont nullable
-- avec NULL = étape pas encore atteinte. Hérite des RLS portal_leads
-- existantes (pas de policy à modifier).

ALTER TABLE public.portal_leads
  ADD COLUMN IF NOT EXISTS commission_invoiced_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS project_completed_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS closed_at             timestamptz NULL;

COMMENT ON COLUMN public.portal_leads.commission_invoiced_at IS
  'Date d''émission de la facture Celexia → artisan (commission). NULL = pas encore facturé.';
COMMENT ON COLUMN public.portal_leads.project_completed_at IS
  'Date de fin de chantier déclarée par l''artisan. NULL = projet en cours.';
COMMENT ON COLUMN public.portal_leads.closed_at IS
  'Date de clôture définitive du dossier (signed projet livré + commission payée). NULL = dossier ouvert.';

-- Index partiel : seuls les leads clôturés (minorité) sont indexés
CREATE INDEX IF NOT EXISTS idx_portal_leads_closed_at
  ON public.portal_leads (closed_at)
  WHERE closed_at IS NOT NULL;

-- Étend le CHECK constraint sur status pour autoriser 'clos'
-- (= dossier verrouillé après que tout soit terminé). On garde 'signe'
-- distinct de 'clos' : signe = devis signé, clos = projet livré + payé.
ALTER TABLE public.portal_leads
  DROP CONSTRAINT IF EXISTS portal_leads_status_check;

ALTER TABLE public.portal_leads
  ADD CONSTRAINT portal_leads_status_check
  CHECK (status IN ('nouveau', 'qualifie', 'devis', 'signe', 'perdu', 'clos'));
