-- Migration 00040: All new features
-- §0: audit_deletions for dedup tracking
-- §3: contracts storage
-- §4: commissions, budget_payments, invoices for financial module
-- §5: No new tables needed (uses existing calls, rendez_vous, opportunities)

-- ============================================================
-- §0: AUDIT DELETIONS (dedup tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_deletions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  deleted_prospect_id UUID NOT NULL,
  kept_prospect_id UUID NOT NULL,
  deleted_company_name TEXT,
  kept_company_name TEXT,
  reason TEXT DEFAULT 'phone_duplicate',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_deletions_phone ON audit_deletions(phone);

-- ============================================================
-- §3: CONTRACTS (client file uploads)
-- ============================================================
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_contracts_client ON contracts(client_id) WHERE deleted_at IS NULL;

-- ============================================================
-- §4a: COMMISSIONS (monthly 10% tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  opportunity_id UUID REFERENCES opportunities(id),
  month DATE NOT NULL,  -- first day of month (2026-03-01)
  revenue_generated NUMERIC(12,2) NOT NULL DEFAULT 0,  -- CA généré pour le client
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.10,   -- 10%
  commission_amount NUMERIC(12,2) GENERATED ALWAYS AS (revenue_generated * commission_rate) STORED,
  status TEXT NOT NULL DEFAULT 'a_recevoir' CHECK (status IN ('a_recevoir', 'recu', 'en_retard')),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_commissions_client ON commissions(client_id);
CREATE INDEX idx_commissions_month ON commissions(month);
CREATE INDEX idx_commissions_status ON commissions(status);

CREATE TRIGGER commissions_updated_at
  BEFORE UPDATE ON commissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- §4b: BUDGET PAYMENTS (budget pub versements)
-- ============================================================
CREATE TABLE IF NOT EXISTS budget_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  opportunity_id UUID REFERENCES opportunities(id),
  amount NUMERIC(12,2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_budget_payments_client ON budget_payments(client_id);

-- ============================================================
-- §4c: INVOICES (factures uploadées)
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL DEFAULT 'commission' CHECK (type IN ('commission', 'budget_pub')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_invoices_client ON invoices(client_id) WHERE deleted_at IS NULL;

-- ============================================================
-- §6: EMAIL LOGS (track automated emails)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  prospect_id UUID REFERENCES prospects(id),
  client_id UUID REFERENCES clients(id),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_logs_type ON email_logs(type, created_at DESC);
CREATE INDEX idx_email_logs_prospect ON email_logs(prospect_id) WHERE prospect_id IS NOT NULL;

-- ============================================================
-- RLS policies for new tables
-- ============================================================
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_deletions ENABLE ROW LEVEL SECURITY;

-- All authenticated can read
CREATE POLICY "Authenticated read contracts" ON contracts FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY "Authenticated insert contracts" ON contracts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update contracts" ON contracts FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated read commissions" ON commissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert commissions" ON commissions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update commissions" ON commissions FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated read budget_payments" ON budget_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert budget_payments" ON budget_payments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated read invoices" ON invoices FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY "Authenticated insert invoices" ON invoices FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated read email_logs" ON email_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert email_logs" ON email_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Founders read audit_deletions" ON audit_deletions FOR SELECT TO authenticated USING (true);
