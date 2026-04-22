-- Récupère les onboardings passés en "rejected" (ancienne logique)
-- et les remet en "in_progress" pour que l'artisan puisse corriger.
-- Le motif (rejection_reason) est conservé — l'artisan le verra sur son écran welcome.

UPDATE portal_onboardings
SET status = 'in_progress',
    completed_at = NULL
WHERE status = 'rejected';
