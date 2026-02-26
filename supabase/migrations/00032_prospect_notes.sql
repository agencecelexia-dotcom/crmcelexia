-- ============================================
-- CRM CELEXIA — Notes partagees par prospect
-- Migration 00032
-- ============================================
-- Zone de notes d'equipe par prospect : chaque commercial peut ajouter
-- des notes visibles par toute l'equipe, en temps reel.

CREATE TABLE prospect_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID        NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  author_id   UUID        NOT NULL REFERENCES profiles(id),
  content     TEXT        NOT NULL CHECK (char_length(content) > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prospect_notes_prospect_id ON prospect_notes(prospect_id);
CREATE INDEX idx_prospect_notes_author_id   ON prospect_notes(author_id);

-- RLS
ALTER TABLE prospect_notes ENABLE ROW LEVEL SECURITY;

-- Tous les membres authentifies peuvent lire les notes
CREATE POLICY "prospect_notes_select"
  ON prospect_notes FOR SELECT
  TO authenticated
  USING (true);

-- Chacun peut ajouter ses propres notes
CREATE POLICY "prospect_notes_insert"
  ON prospect_notes FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

-- Suppression : sa propre note OU fondateur
CREATE POLICY "prospect_notes_delete"
  ON prospect_notes FOR DELETE
  TO authenticated
  USING (author_id = auth.uid() OR is_founder());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE prospect_notes;
