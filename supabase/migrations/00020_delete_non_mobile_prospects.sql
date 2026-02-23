-- Delete prospects whose phone number does not start with 06 or 07
-- Delete dependent records in FK order (children first)

DELETE FROM webhook_events WHERE prospect_id IN (
  SELECT id FROM prospects WHERE phone !~ '^0[67]' AND deleted_at IS NULL
);

DELETE FROM webhook_events WHERE rdv_id IN (
  SELECT id FROM rendez_vous WHERE prospect_id IN (
    SELECT id FROM prospects WHERE phone !~ '^0[67]' AND deleted_at IS NULL
  )
);

DELETE FROM notifications WHERE id IN (
  SELECT n.id FROM notifications n
  JOIN event_log e ON n.id = n.id
  WHERE 1=0
);

DELETE FROM event_log WHERE entity_type = 'prospect' AND entity_id::uuid IN (
  SELECT id FROM prospects WHERE phone !~ '^0[67]' AND deleted_at IS NULL
);

DELETE FROM calls WHERE prospect_id IN (
  SELECT id FROM prospects WHERE phone !~ '^0[67]' AND deleted_at IS NULL
);

DELETE FROM reminders WHERE prospect_id IN (
  SELECT id FROM prospects WHERE phone !~ '^0[67]' AND deleted_at IS NULL
);

DELETE FROM rendez_vous WHERE prospect_id IN (
  SELECT id FROM prospects WHERE phone !~ '^0[67]' AND deleted_at IS NULL
);

DELETE FROM prospects WHERE phone !~ '^0[67]' AND deleted_at IS NULL;
