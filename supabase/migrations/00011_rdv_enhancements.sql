-- ============================================
-- CRM CELEXIA — RDV Enhancements & Cal.com Fix
-- ============================================

-- 1. Add new RDV statuses: confirme, show, close, perdu
ALTER TYPE rdv_status ADD VALUE IF NOT EXISTS 'confirme';
ALTER TYPE rdv_status ADD VALUE IF NOT EXISTS 'show';
ALTER TYPE rdv_status ADD VALUE IF NOT EXISTS 'close';
ALTER TYPE rdv_status ADD VALUE IF NOT EXISTS 'perdu';

-- 2. Add external_booking_id column for reliable Cal.com deduplication
ALTER TABLE rendez_vous
  ADD COLUMN IF NOT EXISTS external_booking_id TEXT;

CREATE INDEX IF NOT EXISTS idx_rdv_external_booking_id
  ON rendez_vous(external_booking_id)
  WHERE external_booking_id IS NOT NULL;

-- 3. Add prospect status transition: nouveau → rdv_pris
-- (handled in app code, no DB constraint needed)

-- 4. Add webhook_events table for tracking Cal.com webhook processing
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_type TEXT NOT NULL DEFAULT 'calcom',
  event_type TEXT NOT NULL,
  trigger_id TEXT,
  prospect_id UUID REFERENCES prospects(id),
  rdv_id UUID REFERENCES rendez_vous(id),
  status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_prospect ON webhook_events(prospect_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at);

-- RLS for webhook_events (founders only)
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_events_select ON webhook_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('fondateur', 'co_fondateur'))
  );

-- 5. Add index on prospects.contact_email for faster webhook matching
CREATE INDEX IF NOT EXISTS idx_prospects_contact_email
  ON prospects(contact_email)
  WHERE contact_email IS NOT NULL AND deleted_at IS NULL;

-- 6. Add index on prospects.phone for faster webhook matching
CREATE INDEX IF NOT EXISTS idx_prospects_phone
  ON prospects(phone)
  WHERE deleted_at IS NULL;
