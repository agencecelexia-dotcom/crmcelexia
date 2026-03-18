-- ============================================
-- CRM CELEXIA — Service Type Separation (Site Web / Pub)
-- ============================================

-- 1. Add service_type enum
CREATE TYPE service_type AS ENUM ('site_web', 'pub');

-- 2. Add service_type to opportunities
ALTER TABLE opportunities
  ADD COLUMN service_type service_type NOT NULL DEFAULT 'site_web';

CREATE INDEX idx_opportunities_service_type ON opportunities(service_type) WHERE deleted_at IS NULL;

-- 3. Add pub-specific fields to opportunities
-- For "pub" (Local Services Ads): track revenue generated and commission
ALTER TABLE opportunities
  ADD COLUMN client_revenue NUMERIC(12,2),         -- Revenue generated for the client
  ADD COLUMN commission_rate NUMERIC(5,2) DEFAULT 10.00,  -- Commission % (default 10%)
  ADD COLUMN commission_amount NUMERIC(12,2);       -- Calculated commission

-- 4. Add service_type to rendez_vous (to distinguish RDV type)
ALTER TABLE rendez_vous
  ADD COLUMN service_type service_type;

-- 5. Add second Cal.com link for pub in company_settings
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS calcom_link_pub TEXT DEFAULT '';

-- 6. Set the pub Cal.com link
UPDATE company_settings
SET calcom_link_pub = 'https://cal.com/agence-celexia-1qyn93/apport-d-affaires?overlayCalendar=true',
    updated_at = now();
