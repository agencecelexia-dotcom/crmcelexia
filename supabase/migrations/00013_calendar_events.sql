-- ============================================
-- CRM CELEXIA — Manual Calendar Events
-- ============================================

CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  color TEXT NOT NULL DEFAULT '#8B5CF6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Founders see all, commercials see own
CREATE POLICY calendar_events_select ON calendar_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('fondateur', 'co_fondateur'))
    OR user_id = auth.uid()
  );

CREATE POLICY calendar_events_insert ON calendar_events
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY calendar_events_update ON calendar_events
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY calendar_events_delete ON calendar_events
  FOR DELETE USING (user_id = auth.uid());
