-- Migration 00039: Add pub stats fields to opportunities
-- budget_pub = how much client wants to spend on ads
-- estimated_monthly_revenue = estimated monthly revenue from ads (our calculator)
-- commission = 10% of estimated_monthly_revenue (calculated in app)

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS budget_pub NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_monthly_revenue NUMERIC DEFAULT 0;
