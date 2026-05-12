-- ════════════════════════════════════════════════════════════════════
-- 00095 — Remap les dates du seed Aquastyle vers les 30 derniers jours
-- (one-shot, idempotent via WHERE strict sur l.created_at < new_min).
-- Le trigger enforce_portal_leads_artisan_invariants force NEW.created_at
-- := OLD.created_at pour les non-founders, donc on le désactive le temps
-- du remap pour ne pas se faire écraser silencieusement.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE portal_leads DISABLE TRIGGER trg_enforce_portal_leads_artisan_invariants;

-- portal_leads
WITH bounds AS (
  SELECT
    '2026-02-26 00:00:00+00'::timestamptz AS old_min,
    '2026-04-01 23:59:59+00'::timestamptz AS old_max,
    '2026-04-13 00:00:00+00'::timestamptz AS new_min,
    '2026-05-12 23:59:59+00'::timestamptz AS new_max
)
UPDATE portal_leads l SET
  created_at = bounds.new_min + (
    EXTRACT(EPOCH FROM (l.created_at - bounds.old_min)) /
    EXTRACT(EPOCH FROM (bounds.old_max - bounds.old_min)) *
    EXTRACT(EPOCH FROM (bounds.new_max - bounds.new_min))
  ) * INTERVAL '1 second',
  updated_at = bounds.new_min + (
    EXTRACT(EPOCH FROM (l.created_at - bounds.old_min)) /
    EXTRACT(EPOCH FROM (bounds.old_max - bounds.old_min)) *
    EXTRACT(EPOCH FROM (bounds.new_max - bounds.new_min))
  ) * INTERVAL '1 second',
  signed_at = CASE WHEN l.signed_at IS NOT NULL THEN
    (bounds.new_min + (
      EXTRACT(EPOCH FROM (l.signed_at::timestamptz - bounds.old_min)) /
      EXTRACT(EPOCH FROM (bounds.old_max - bounds.old_min)) *
      EXTRACT(EPOCH FROM (bounds.new_max - bounds.new_min))
    ) * INTERVAL '1 second')::date
  ELSE NULL END
FROM bounds
WHERE l.client_id = 'a3533372-e675-45fc-a4fc-f0ef7b83f45f'
  AND l.source = 'lsa'
  AND l.created_at < '2026-04-13'::timestamptz;

-- quotes
WITH bounds AS (
  SELECT
    '2026-02-26 00:00:00+00'::timestamptz AS old_min,
    '2026-04-02 23:59:59+00'::timestamptz AS old_max,
    '2026-04-13 00:00:00+00'::timestamptz AS new_min,
    '2026-05-12 23:59:59+00'::timestamptz AS new_max
)
UPDATE quotes q SET
  created_at = bounds.new_min + (
    EXTRACT(EPOCH FROM (q.created_at - bounds.old_min)) /
    EXTRACT(EPOCH FROM (bounds.old_max - bounds.old_min)) *
    EXTRACT(EPOCH FROM (bounds.new_max - bounds.new_min))
  ) * INTERVAL '1 second',
  issued_at = (bounds.new_min + (
    EXTRACT(EPOCH FROM (q.issued_at::timestamptz - bounds.old_min)) /
    EXTRACT(EPOCH FROM (bounds.old_max - bounds.old_min)) *
    EXTRACT(EPOCH FROM (bounds.new_max - bounds.new_min))
  ) * INTERVAL '1 second')::date,
  valid_until = (bounds.new_min + (
    EXTRACT(EPOCH FROM (q.valid_until::timestamptz - bounds.old_min)) /
    EXTRACT(EPOCH FROM (bounds.old_max - bounds.old_min)) *
    EXTRACT(EPOCH FROM (bounds.new_max - bounds.new_min))
  ) * INTERVAL '1 second')::date,
  sent_at = CASE WHEN q.sent_at IS NOT NULL THEN
    bounds.new_min + (
      EXTRACT(EPOCH FROM (q.sent_at - bounds.old_min)) /
      EXTRACT(EPOCH FROM (bounds.old_max - bounds.old_min)) *
      EXTRACT(EPOCH FROM (bounds.new_max - bounds.new_min))
    ) * INTERVAL '1 second'
  ELSE NULL END,
  signed_at = CASE WHEN q.signed_at IS NOT NULL THEN
    bounds.new_min + (
      EXTRACT(EPOCH FROM (q.signed_at - bounds.old_min)) /
      EXTRACT(EPOCH FROM (bounds.old_max - bounds.old_min)) *
      EXTRACT(EPOCH FROM (bounds.new_max - bounds.new_min))
    ) * INTERVAL '1 second'
  ELSE NULL END
FROM bounds
WHERE q.client_id = 'a3533372-e675-45fc-a4fc-f0ef7b83f45f'
  AND q.created_at < '2026-04-13'::timestamptz
  AND q.deleted_at IS NULL;

ALTER TABLE portal_leads ENABLE TRIGGER trg_enforce_portal_leads_artisan_invariants;
