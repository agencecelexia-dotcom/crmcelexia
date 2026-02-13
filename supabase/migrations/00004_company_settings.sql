-- Company settings (singleton row)
CREATE TABLE IF NOT EXISTS company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT '',
  siret TEXT DEFAULT '',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  website TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default row
INSERT INTO company_settings (company_name) VALUES ('Celexia');

-- RLS
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "company_settings_read" ON company_settings
  FOR SELECT TO authenticated USING (true);

-- Only founders can update
CREATE POLICY "company_settings_update" ON company_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('fondateur', 'co_fondateur')
    )
  );
