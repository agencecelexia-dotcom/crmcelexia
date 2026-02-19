-- ============================================
-- Enable Supabase Realtime on rendez_vous table
-- Required for instant RDV updates in the frontend
-- ============================================

-- Add rendez_vous to the supabase_realtime publication
-- This allows the frontend to subscribe to INSERT/UPDATE/DELETE events
ALTER PUBLICATION supabase_realtime ADD TABLE rendez_vous;

-- Also enable for prospects (so status changes are visible in real-time)
ALTER PUBLICATION supabase_realtime ADD TABLE prospects;
