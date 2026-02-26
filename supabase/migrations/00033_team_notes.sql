-- ============================================
-- CRM CELEXIA — Notes d'equipe partag??es
-- Migration 00033
-- ============================================
-- Remplace prospect_notes (lie a un prospect) par team_notes :
-- un bloc-notes general par utilisateur, visible par toute l'equipe.
-- Chaque membre peut ecrire librement, les autres voient en temps reel.

-- On supprime la table prospect_notes cr??e par erreur en 00032
DROP TABLE IF EXISTS prospect_notes;

-- Table team_notes : un enregistrement par utilisateur (UNIQUE author_id)
CREATE TABLE IF NOT EXISTS team_notes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  UUID        NOT NULL UNIQUE REFERENCES profiles(id),
  content    TEXT        NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_notes_author_id ON team_notes(author_id);

-- RLS
ALTER TABLE team_notes ENABLE ROW LEVEL SECURITY;

-- Tous les membres authentifies peuvent lire
CREATE POLICY "team_notes_select"
  ON team_notes FOR SELECT
  TO authenticated
  USING (true);

-- Chacun peut creer sa propre note
CREATE POLICY "team_notes_insert"
  ON team_notes FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

-- Chacun peut modifier uniquement sa propre note
CREATE POLICY "team_notes_update"
  ON team_notes FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Trigger pour mettre a jour updated_at
CREATE OR REPLACE FUNCTION set_team_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_team_notes_updated_at
  BEFORE UPDATE ON team_notes
  FOR EACH ROW
  EXECUTE FUNCTION set_team_notes_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE team_notes;
