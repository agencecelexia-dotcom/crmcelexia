-- Fix statuses for Notion-imported prospects that were incorrectly set to site_envoye
-- Jerome MSB, Arnaud Zlotos → site_en_attente (no site built yet)
-- Jeremy paysagiste → site_en_attente (was a_rappeler, no site yet)

UPDATE prospects SET status = 'site_en_attente'
WHERE company_name = 'MSB MULTI SERVICES BATIMENTS' AND deleted_at IS NULL;

UPDATE prospects SET status = 'site_en_attente'
WHERE company_name = 'AZ COUVERTURE CHARPENTE' AND deleted_at IS NULL;

UPDATE prospects SET status = 'site_en_attente'
WHERE company_name = 'croisic espace vert' AND deleted_at IS NULL;

-- Mickael Le Gall: RDV already done (fait), create follow-up reminder 7j from jeudi 19/02
-- Create a rendez_vous record marked as "fait"
INSERT INTO rendez_vous (prospect_id, commercial_id, scheduled_at, duration_minutes, type, status, notes)
SELECT p.id, p.commercial_id, '2026-02-20T14:00:00+01:00', 60, 'presentiel', 'fait',
  'RDV fait le 20/02 à 14h — en attente retour max 7j'
FROM prospects p
WHERE p.company_name = 'Atelier Le Gall menuisier' AND p.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM rendez_vous r WHERE r.prospect_id = p.id);

-- Create follow-up reminder for Feb 26 (7 days from Feb 19)
INSERT INTO reminders (prospect_id, commercial_id, remind_at, note)
SELECT p.id, p.commercial_id, '2026-02-26T09:00:00+01:00',
  'RELANCE: 7j écoulés depuis RDV du 20/02 — relancer Mickael Le Gall pour retour'
FROM prospects p
WHERE p.company_name = 'Atelier Le Gall menuisier' AND p.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM reminders r WHERE r.prospect_id = p.id AND r.is_completed = false);

-- Create RDV records for prospects with planned RDVs (Magalie, Pierre)
-- Magalie Rouleau (DM Services) — RDV jeudi 27/02 à 11h
INSERT INTO rendez_vous (prospect_id, commercial_id, scheduled_at, duration_minutes, type, status, notes)
SELECT p.id, p.commercial_id, '2026-02-27T11:00:00+01:00', 60, 'visio', 'prevu',
  'RDV prévu jeudi à 11h'
FROM prospects p
WHERE p.company_name = 'DM Services' AND p.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM rendez_vous r WHERE r.prospect_id = p.id);

-- Pierre Capello — RDV à 14h (jeudi 27/02)
INSERT INTO rendez_vous (prospect_id, commercial_id, scheduled_at, duration_minutes, type, status, notes)
SELECT p.id, p.commercial_id, '2026-02-27T14:00:00+01:00', 60, 'visio', 'prevu',
  'RDV prévu à 14h'
FROM prospects p
WHERE p.company_name = 'pierre CAPELLO' AND p.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM rendez_vous r WHERE r.prospect_id = p.id);
