-- Migration 00041: Portail Client Celexia
-- Adds: artisan role, portal_onboardings, portal_leads, portal_lead_events
-- Extends: clients table with user_id + portal flags

-- ============================================================
-- 1. Extend user_role enum with 'artisan'
-- ============================================================
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'artisan';

-- ============================================================
-- 2. Extend clients table for portal
-- ============================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_activated_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id) WHERE user_id IS NOT NULL;

-- ============================================================
-- 3. portal_onboardings — one per client, tracks 5 steps
-- ============================================================
CREATE TABLE portal_onboardings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'pending_validation', 'validated', 'rejected', 'abandoned')),

  -- Step 1: contract signature
  contract_signed BOOLEAN NOT NULL DEFAULT false,
  contract_signature_data TEXT,
  contract_signed_at TIMESTAMPTZ,

  -- Step 2: payment proof (budget pub, variable amount)
  payment_proof_uploaded BOOLEAN NOT NULL DEFAULT false,
  payment_proof_path TEXT,
  payment_amount NUMERIC(10,2),

  -- Step 3: GMB access
  gmb_access_confirmed BOOLEAN NOT NULL DEFAULT false,
  gmb_confirmed_at TIMESTAMPTZ,

  -- Step 4: legal docs (RC Pro + Kbis)
  rc_pro_uploaded BOOLEAN NOT NULL DEFAULT false,
  rc_pro_path TEXT,
  kbis_uploaded BOOLEAN NOT NULL DEFAULT false,
  kbis_path TEXT,

  -- Step 5: training video + quiz
  training_video_watched BOOLEAN NOT NULL DEFAULT false,
  training_video_watched_at TIMESTAMPTZ,
  quiz_score INTEGER,
  quiz_answers JSONB,
  quiz_completed_at TIMESTAMPTZ,

  -- Admin validation
  validated_by UUID REFERENCES profiles(id),
  validated_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Progress tracking
  current_step INTEGER NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,

  -- Reminder automation
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reminder_sent_at TIMESTAMPTZ,
  reminder_count INTEGER NOT NULL DEFAULT 0,
  reminders_disabled BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update timestamps + reset reminders on step progress
CREATE OR REPLACE FUNCTION portal_onboarding_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  IF (NEW.contract_signed IS DISTINCT FROM OLD.contract_signed)
    OR (NEW.payment_proof_uploaded IS DISTINCT FROM OLD.payment_proof_uploaded)
    OR (NEW.gmb_access_confirmed IS DISTINCT FROM OLD.gmb_access_confirmed)
    OR (NEW.rc_pro_uploaded IS DISTINCT FROM OLD.rc_pro_uploaded)
    OR (NEW.kbis_uploaded IS DISTINCT FROM OLD.kbis_uploaded)
    OR (NEW.training_video_watched IS DISTINCT FROM OLD.training_video_watched)
    OR (NEW.quiz_completed_at IS DISTINCT FROM OLD.quiz_completed_at)
  THEN
    NEW.last_activity_at := now();
    NEW.reminder_count := 0;
    NEW.last_reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_portal_onboarding_activity
  BEFORE UPDATE ON portal_onboardings
  FOR EACH ROW EXECUTE FUNCTION portal_onboarding_activity();

-- ============================================================
-- 4. portal_leads — artisan's lead pipeline
-- ============================================================
CREATE TABLE portal_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Lead info
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT,
  work_type TEXT NOT NULL,
  amount_estimated NUMERIC(12,2),
  source TEXT NOT NULL DEFAULT 'lsa'
    CHECK (source IN ('lsa', 'bao')),
  status TEXT NOT NULL DEFAULT 'nouveau'
    CHECK (status IN ('nouveau', 'qualifie', 'devis', 'signe', 'perdu')),

  -- Signed deal
  signed_amount NUMERIC(12,2),
  signed_at DATE,
  signed_pdf_path TEXT,

  -- Commission (auto-calculated)
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.10,
  commission_amount NUMERIC(12,2) GENERATED ALWAYS AS (
    CASE WHEN signed_amount IS NOT NULL THEN ROUND(signed_amount * commission_rate, 2) ELSE NULL END
  ) STORED,

  -- Metadata
  notes TEXT,
  is_urgent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_portal_leads_client ON portal_leads(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_portal_leads_status ON portal_leads(client_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_portal_leads_signed ON portal_leads(signed_at) WHERE signed_at IS NOT NULL;

CREATE TRIGGER portal_leads_updated_at
  BEFORE UPDATE ON portal_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 5. portal_lead_events — activity timeline per lead
-- ============================================================
CREATE TABLE portal_lead_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_lead_id UUID NOT NULL REFERENCES portal_leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('created', 'status_change', 'call', 'note', 'signed', 'lost')),
  description TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_portal_lead_events_lead ON portal_lead_events(portal_lead_id, created_at DESC);

-- ============================================================
-- 6. RLS Policies
-- ============================================================
ALTER TABLE portal_onboardings ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_lead_events ENABLE ROW LEVEL SECURITY;

-- Helper: check if current user is a founder
-- (reuses existing is_founder() function)

-- portal_onboardings: artisan sees own, admin sees all
CREATE POLICY "portal_onb_artisan_select" ON portal_onboardings
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "portal_onb_artisan_update" ON portal_onboardings
  FOR UPDATE TO authenticated
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "portal_onb_admin_all" ON portal_onboardings
  FOR ALL TO authenticated
  USING (public.is_founder());

-- portal_leads: artisan CRUD own, admin sees all
CREATE POLICY "portal_leads_artisan_select" ON portal_leads
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "portal_leads_artisan_insert" ON portal_leads
  FOR INSERT TO authenticated
  WITH CHECK (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "portal_leads_artisan_update" ON portal_leads
  FOR UPDATE TO authenticated
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "portal_leads_admin_all" ON portal_leads
  FOR ALL TO authenticated
  USING (public.is_founder());

-- portal_lead_events: artisan reads own, admin reads all
CREATE POLICY "portal_events_artisan_select" ON portal_lead_events
  FOR SELECT TO authenticated
  USING (portal_lead_id IN (
    SELECT pl.id FROM portal_leads pl
    JOIN clients c ON c.id = pl.client_id
    WHERE c.user_id = auth.uid()
  ));

CREATE POLICY "portal_events_artisan_insert" ON portal_lead_events
  FOR INSERT TO authenticated
  WITH CHECK (portal_lead_id IN (
    SELECT pl.id FROM portal_leads pl
    JOIN clients c ON c.id = pl.client_id
    WHERE c.user_id = auth.uid()
  ));

CREATE POLICY "portal_events_admin_all" ON portal_lead_events
  FOR ALL TO authenticated
  USING (public.is_founder());

-- ============================================================
-- 7. Storage bucket for portal documents
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('portal-documents', 'portal-documents', false)
ON CONFLICT DO NOTHING;

-- Storage RLS: artisan uploads to own folder (client_id/)
CREATE POLICY "portal_doc_artisan_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portal-documents' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM clients WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "portal_doc_artisan_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'portal-documents' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM clients WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "portal_doc_admin_all" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'portal-documents' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('fondateur', 'co_fondateur'))
  );
