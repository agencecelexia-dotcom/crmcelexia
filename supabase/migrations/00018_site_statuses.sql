-- Add site_en_attente and site_envoye statuses, add date_envoi_site column
-- Replaces the old 'interesse' status

ALTER TYPE prospect_status ADD VALUE IF NOT EXISTS 'site_en_attente';
ALTER TYPE prospect_status ADD VALUE IF NOT EXISTS 'site_envoye';

-- Add date_envoi_site column to track when the demo site was sent
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS date_envoi_site date;
