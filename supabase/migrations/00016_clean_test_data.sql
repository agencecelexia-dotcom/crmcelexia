-- One-time cleanup: remove all test data, keep profiles & config
-- Respects foreign key order (children first)

TRUNCATE TABLE webhook_events CASCADE;
TRUNCATE TABLE calendar_events CASCADE;
TRUNCATE TABLE notifications CASCADE;
TRUNCATE TABLE event_log CASCADE;
TRUNCATE TABLE saved_views CASCADE;
TRUNCATE TABLE devis CASCADE;
TRUNCATE TABLE project_documents CASCADE;
TRUNCATE TABLE project_notes CASCADE;
TRUNCATE TABLE projects CASCADE;
TRUNCATE TABLE rendez_vous CASCADE;
TRUNCATE TABLE reminders CASCADE;
TRUNCATE TABLE calls CASCADE;
TRUNCATE TABLE clients CASCADE;
TRUNCATE TABLE prospects CASCADE;
TRUNCATE TABLE csv_imports CASCADE;
