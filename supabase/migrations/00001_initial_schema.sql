-- ============================================
-- CRM CELEXIA — Initial Schema
-- ============================================

-- ============ ENUMS ============

CREATE TYPE user_role AS ENUM ('fondateur', 'co_fondateur', 'commercial');
CREATE TYPE prospect_status AS ENUM (
  'nouveau', 'appele_sans_reponse', 'messagerie', 'interesse',
  'negatif', 'a_rappeler', 'rdv_pris', 'perdu', 'converti_client'
);
CREATE TYPE prospect_source AS ENUM ('csv_import', 'manual', 'referral');
CREATE TYPE call_result AS ENUM (
  'no_answer', 'voicemail', 'reached_interested', 'reached_not_interested',
  'reached_callback', 'reached_rdv', 'wrong_number', 'other'
);
CREATE TYPE rdv_status AS ENUM ('prevu', 'fait', 'annule', 'no_show');
CREATE TYPE rdv_type AS ENUM ('telephone', 'visio', 'presentiel');
CREATE TYPE devis_status AS ENUM ('brouillon', 'envoye', 'signe', 'refuse', 'expire');
CREATE TYPE project_status AS ENUM ('onboarding', 'en_cours', 'en_attente', 'termine', 'resilie');
CREATE TYPE client_status AS ENUM ('actif', 'inactif', 'resilie');
CREATE TYPE csv_import_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- ============ HELPER FUNCTIONS ============

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============ TABLES ============

-- profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'commercial',
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'commercial')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- csv_imports
CREATE TABLE csv_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  original_filename TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  column_mapping JSONB NOT NULL DEFAULT '{}',
  assigned_commercial_id UUID REFERENCES profiles(id),
  status csv_import_status NOT NULL DEFAULT 'pending',
  error_log JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- csv_mapping_presets
CREATE TABLE csv_mapping_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  mapping JSONB NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES profiles(id),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- prospects (core entity)
CREATE TABLE prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_firstname TEXT,
  contact_email TEXT,
  phone TEXT NOT NULL,
  phone_secondary TEXT,
  google_maps_url TEXT,
  website TEXT,
  profession TEXT,
  city TEXT,
  zone TEXT,
  address TEXT,
  status prospect_status NOT NULL DEFAULT 'nouveau',
  commercial_id UUID NOT NULL REFERENCES profiles(id),
  import_id UUID REFERENCES csv_imports(id),
  source prospect_source NOT NULL DEFAULT 'manual',
  call_count INTEGER NOT NULL DEFAULT 0,
  last_called_at TIMESTAMPTZ,
  next_reminder_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  client_id UUID, -- FK added after clients table
  notes TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TRIGGER prospects_updated_at
  BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- calls (immutable)
CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id),
  commercial_id UUID NOT NULL REFERENCES profiles(id),
  called_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds INTEGER,
  result call_result NOT NULL,
  previous_status prospect_status NOT NULL,
  new_status prospect_status NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- reminders
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id),
  commercial_id UUID NOT NULL REFERENCES profiles(id),
  remind_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER reminders_updated_at
  BEFORE UPDATE ON reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- rendez_vous
CREATE TABLE rendez_vous (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id),
  commercial_id UUID NOT NULL REFERENCES profiles(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  type rdv_type NOT NULL DEFAULT 'telephone',
  status rdv_status NOT NULL DEFAULT 'prevu',
  result TEXT,
  location TEXT,
  meeting_url TEXT,
  notes TEXT,
  no_show_reason TEXT,
  created_from_call_id UUID REFERENCES calls(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TRIGGER rdv_updated_at
  BEFORE UPDATE ON rendez_vous
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- clients
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID UNIQUE NOT NULL REFERENCES prospects(id),
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_firstname TEXT,
  contact_email TEXT,
  phone TEXT NOT NULL,
  profession TEXT,
  city TEXT,
  address TEXT,
  website TEXT,
  commercial_id UUID NOT NULL REFERENCES profiles(id),
  source prospect_source NOT NULL,
  converted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status client_status NOT NULL DEFAULT 'actif',
  notes TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add FK from prospects to clients
ALTER TABLE prospects
  ADD CONSTRAINT fk_prospects_client
  FOREIGN KEY (client_id) REFERENCES clients(id);

-- projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID UNIQUE NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  description TEXT,
  status project_status NOT NULL DEFAULT 'onboarding',
  start_date DATE,
  end_date DATE,
  monthly_amount NUMERIC(10, 2),
  total_amount NUMERIC(10, 2),
  notes TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- project_notes
CREATE TABLE project_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  author_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TRIGGER project_notes_updated_at
  BEFORE UPDATE ON project_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- project_documents
CREATE TABLE project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- devis
CREATE TABLE devis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  project_id UUID REFERENCES projects(id),
  reference TEXT UNIQUE NOT NULL,
  amount_ht NUMERIC(10, 2) NOT NULL,
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 20.00,
  amount_ttc NUMERIC(10, 2) GENERATED ALWAYS AS (amount_ht * (1 + tax_rate / 100)) STORED,
  status devis_status NOT NULL DEFAULT 'brouillon',
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  refused_at TIMESTAMPTZ,
  valid_until DATE,
  file_path TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TRIGGER devis_updated_at
  BEFORE UPDATE ON devis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- event_log (immutable audit trail)
CREATE TABLE event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  actor_id UUID NOT NULL REFERENCES profiles(id),
  old_values JSONB,
  new_values JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- saved_views
CREATE TABLE saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  module TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  sort JSONB,
  columns JSONB,
  created_by UUID NOT NULL REFERENCES profiles(id),
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER saved_views_updated_at
  BEFORE UPDATE ON saved_views
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ INDEXES ============

-- prospects
CREATE INDEX idx_prospects_commercial_status ON prospects(commercial_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_prospects_profession ON prospects(profession) WHERE deleted_at IS NULL;
CREATE INDEX idx_prospects_city ON prospects(city) WHERE deleted_at IS NULL;
CREATE INDEX idx_prospects_import ON prospects(import_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_prospects_next_reminder ON prospects(next_reminder_at) WHERE deleted_at IS NULL AND next_reminder_at IS NOT NULL;
CREATE INDEX idx_prospects_last_called ON prospects(last_called_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_prospects_status ON prospects(status) WHERE deleted_at IS NULL;

-- calls
CREATE INDEX idx_calls_prospect ON calls(prospect_id, called_at DESC);
CREATE INDEX idx_calls_commercial ON calls(commercial_id, called_at DESC);
CREATE INDEX idx_calls_date ON calls(called_at);

-- reminders
CREATE INDEX idx_reminders_commercial_pending ON reminders(commercial_id, remind_at) WHERE is_completed = false;
CREATE INDEX idx_reminders_prospect ON reminders(prospect_id);

-- rendez_vous
CREATE INDEX idx_rdv_commercial ON rendez_vous(commercial_id, scheduled_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_rdv_prospect ON rendez_vous(prospect_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_rdv_status ON rendez_vous(status) WHERE deleted_at IS NULL;

-- event_log
CREATE INDEX idx_event_log_entity ON event_log(entity_type, entity_id);
CREATE INDEX idx_event_log_type ON event_log(event_type, created_at);
CREATE INDEX idx_event_log_actor ON event_log(actor_id, created_at);

-- devis
CREATE INDEX idx_devis_client ON devis(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_devis_status ON devis(status) WHERE deleted_at IS NULL;

-- notifications
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- clients
CREATE INDEX idx_clients_commercial ON clients(commercial_id) WHERE deleted_at IS NULL;
