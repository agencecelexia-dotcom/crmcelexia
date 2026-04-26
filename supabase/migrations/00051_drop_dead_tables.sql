-- ISSUE-007 : Drop tables mortes confirmées (saved_views + notifications)
--
-- Audit du 2026-04-26 :
-- - saved_views      : 0 rows en prod, 0 référence dans src/ et supabase/functions/
-- - notifications    : 0 rows en prod, 0 référence dans src/ et supabase/functions/
--
-- Tables NON droppées :
-- - event_log        : 2892 rows trouvées en prod → KEEP (quelque chose y écrit)
-- - project_notes    : 0 rows mais code CRUD existant dans client-service.ts → KEEP
-- - project_documents: 0 rows mais code CRUD existant → KEEP
--
-- CASCADE pour gérer les éventuelles policies RLS / triggers / FK dépendants.

DROP TABLE IF EXISTS saved_views CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
