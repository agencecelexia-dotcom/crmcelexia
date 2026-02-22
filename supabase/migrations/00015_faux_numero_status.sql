-- Add faux_numero status for bad phone numbers / wrong businesses
-- This is a terminal status (like converti_client) that doesn't pollute commercial stats
ALTER TYPE prospect_status ADD VALUE IF NOT EXISTS 'faux_numero';
