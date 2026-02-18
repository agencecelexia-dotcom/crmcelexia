-- Add cal.com integration fields to company_settings
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS calcom_link TEXT DEFAULT '';
