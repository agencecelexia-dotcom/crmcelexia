-- ============================================
-- CRM CELEXIA — Row Level Security Policies
-- ============================================

-- ============ HELPER FUNCTIONS ============

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_founder()
RETURNS boolean AS $$
  SELECT public.get_user_role() IN ('fondateur', 'co_fondateur')
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============ ENABLE RLS ON ALL TABLES ============

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendez_vous ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE devis ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE csv_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE csv_mapping_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============ PROFILES ============

CREATE POLICY "profiles_select"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_founder() OR id = auth.uid());

CREATE POLICY "profiles_insert"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (is_founder());

CREATE POLICY "profiles_update"
  ON profiles FOR UPDATE
  TO authenticated
  USING (is_founder() OR id = auth.uid())
  WITH CHECK (is_founder() OR id = auth.uid());

-- No DELETE policy (soft delete only)

-- ============ PROSPECTS ============

CREATE POLICY "prospects_select"
  ON prospects FOR SELECT
  TO authenticated
  USING (is_founder() OR commercial_id = auth.uid());

CREATE POLICY "prospects_insert"
  ON prospects FOR INSERT
  TO authenticated
  WITH CHECK (is_founder() OR commercial_id = auth.uid());

CREATE POLICY "prospects_update"
  ON prospects FOR UPDATE
  TO authenticated
  USING (is_founder() OR commercial_id = auth.uid())
  WITH CHECK (is_founder() OR commercial_id = auth.uid());

-- No DELETE policy

-- ============ CALLS (IMMUTABLE) ============

CREATE POLICY "calls_select"
  ON calls FOR SELECT
  TO authenticated
  USING (is_founder() OR commercial_id = auth.uid());

CREATE POLICY "calls_insert"
  ON calls FOR INSERT
  TO authenticated
  WITH CHECK (is_founder() OR commercial_id = auth.uid());

-- NO UPDATE policy — calls are immutable
-- NO DELETE policy — calls are immutable

-- ============ REMINDERS ============

CREATE POLICY "reminders_select"
  ON reminders FOR SELECT
  TO authenticated
  USING (is_founder() OR commercial_id = auth.uid());

CREATE POLICY "reminders_insert"
  ON reminders FOR INSERT
  TO authenticated
  WITH CHECK (is_founder() OR commercial_id = auth.uid());

CREATE POLICY "reminders_update"
  ON reminders FOR UPDATE
  TO authenticated
  USING (is_founder() OR commercial_id = auth.uid())
  WITH CHECK (is_founder() OR commercial_id = auth.uid());

-- No DELETE policy

-- ============ RENDEZ_VOUS ============

CREATE POLICY "rdv_select"
  ON rendez_vous FOR SELECT
  TO authenticated
  USING (is_founder() OR commercial_id = auth.uid());

CREATE POLICY "rdv_insert"
  ON rendez_vous FOR INSERT
  TO authenticated
  WITH CHECK (is_founder() OR commercial_id = auth.uid());

CREATE POLICY "rdv_update"
  ON rendez_vous FOR UPDATE
  TO authenticated
  USING (is_founder() OR commercial_id = auth.uid())
  WITH CHECK (is_founder() OR commercial_id = auth.uid());

-- No DELETE policy (soft delete)

-- ============ CLIENTS (FOUNDERS ONLY) ============

CREATE POLICY "clients_select"
  ON clients FOR SELECT
  TO authenticated
  USING (is_founder());

CREATE POLICY "clients_insert"
  ON clients FOR INSERT
  TO authenticated
  WITH CHECK (is_founder());

CREATE POLICY "clients_update"
  ON clients FOR UPDATE
  TO authenticated
  USING (is_founder())
  WITH CHECK (is_founder());

-- ============ PROJECTS (FOUNDERS ONLY) ============

CREATE POLICY "projects_select"
  ON projects FOR SELECT
  TO authenticated
  USING (is_founder());

CREATE POLICY "projects_insert"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (is_founder());

CREATE POLICY "projects_update"
  ON projects FOR UPDATE
  TO authenticated
  USING (is_founder())
  WITH CHECK (is_founder());

-- ============ PROJECT_NOTES (FOUNDERS ONLY) ============

CREATE POLICY "project_notes_select"
  ON project_notes FOR SELECT
  TO authenticated
  USING (is_founder());

CREATE POLICY "project_notes_insert"
  ON project_notes FOR INSERT
  TO authenticated
  WITH CHECK (is_founder());

CREATE POLICY "project_notes_update"
  ON project_notes FOR UPDATE
  TO authenticated
  USING (is_founder())
  WITH CHECK (is_founder());

-- ============ PROJECT_DOCUMENTS (FOUNDERS ONLY) ============

CREATE POLICY "project_documents_select"
  ON project_documents FOR SELECT
  TO authenticated
  USING (is_founder());

CREATE POLICY "project_documents_insert"
  ON project_documents FOR INSERT
  TO authenticated
  WITH CHECK (is_founder());

-- ============ DEVIS (FOUNDERS ONLY) ============

CREATE POLICY "devis_select"
  ON devis FOR SELECT
  TO authenticated
  USING (is_founder());

CREATE POLICY "devis_insert"
  ON devis FOR INSERT
  TO authenticated
  WITH CHECK (is_founder());

CREATE POLICY "devis_update"
  ON devis FOR UPDATE
  TO authenticated
  USING (is_founder())
  WITH CHECK (is_founder());

-- ============ EVENT_LOG (IMMUTABLE) ============

CREATE POLICY "event_log_select"
  ON event_log FOR SELECT
  TO authenticated
  USING (is_founder() OR actor_id = auth.uid());

CREATE POLICY "event_log_insert"
  ON event_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- NO UPDATE policy — immutable
-- NO DELETE policy — immutable

-- ============ CSV_IMPORTS ============

CREATE POLICY "csv_imports_select"
  ON csv_imports FOR SELECT
  TO authenticated
  USING (is_founder() OR uploaded_by = auth.uid());

CREATE POLICY "csv_imports_insert"
  ON csv_imports FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "csv_imports_update"
  ON csv_imports FOR UPDATE
  TO authenticated
  USING (is_founder() OR uploaded_by = auth.uid());

-- ============ CSV_MAPPING_PRESETS ============

CREATE POLICY "csv_presets_select"
  ON csv_mapping_presets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "csv_presets_insert"
  ON csv_mapping_presets FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "csv_presets_update"
  ON csv_mapping_presets FOR UPDATE
  TO authenticated
  USING (is_founder() OR created_by = auth.uid());

-- ============ SAVED_VIEWS ============

CREATE POLICY "saved_views_select"
  ON saved_views FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() OR is_shared = true);

CREATE POLICY "saved_views_insert"
  ON saved_views FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "saved_views_update"
  ON saved_views FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

-- ============ NOTIFICATIONS ============

CREATE POLICY "notifications_select"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_update"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_insert"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);
