-- ============================================
-- Fix: revert opportunities RLS to permissive
-- ============================================
-- La migration 00029 a restreint les policies RLS sur opportunities
-- par commercial_id, ce qui bloque les mises a jour dans certains cas
-- (commercial different, admin non-fondateur, etc.)
-- On revient aux policies permissives d'origine.

-- Supprimer les policies restrictives de 00029
DROP POLICY IF EXISTS "opportunities_select" ON opportunities;
DROP POLICY IF EXISTS "opportunities_insert" ON opportunities;
DROP POLICY IF EXISTS "opportunities_update" ON opportunities;
DROP POLICY IF EXISTS "opportunities_delete" ON opportunities;

-- Restaurer les policies permissives d'origine
CREATE POLICY "Users can view opportunities" ON opportunities
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Users can insert opportunities" ON opportunities
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own opportunities" ON opportunities
  FOR UPDATE TO authenticated
  USING (true);
