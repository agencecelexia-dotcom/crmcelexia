-- Migration 00044: Allow artisans to read their own client record
-- Without this, the RLS policies on portal_onboardings that reference
-- clients via subquery return empty, and the portal auth provider stays
-- stuck because client and onboarding are never loaded.

-- Artisan can read their own client record
CREATE POLICY "clients_artisan_select_own"
  ON clients FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Artisan can also update their own client record (ex: contact info)
CREATE POLICY "clients_artisan_update_own"
  ON clients FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
