-- Système de devis pour les artisans du portail
--
-- Objectif : permettre à un artisan de créer rapidement des devis pros
-- (mentions légales auto, logo, PDF qualité prod). MVP V1 — la bibliothèque
-- de prestations est sur la même migration mais peut rester optionnelle.
--
-- Architecture :
--   quote_settings  : 1 ligne par artisan (logo, mentions, RIB par défaut)
--   quotes          : 1 ligne par devis
--   quote_items     : N lignes par devis (description, qté, prix HT, TVA)
--   quote_item_library : bibliothèque de prestations réutilisables (option)

-- ════════════════════════════════════════════════════════════════════
-- 1. quote_settings (1 par artisan)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quote_settings (
  client_id uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  logo_path text,
  -- Identité légale (utilisée sur tous les devis)
  company_legal_name text,
  company_form text,         -- 'SARL', 'EURL', 'EI', 'Auto-entrepreneur', ...
  company_address text,
  company_postal_code text,
  company_city text,
  company_phone text,
  company_email text,
  company_website text,
  siret text,
  siren text,
  ape_code text,
  rcs_city text,
  vat_number text,           -- N° TVA intracom (FR12 XXXXXXXXX)
  -- Assurance décennale (BTP)
  decennale_provider text,
  decennale_policy text,
  -- RIB
  iban text,
  bic text,
  -- Défauts pour nouveaux devis
  default_vat_rate numeric DEFAULT 20,
  default_validity_days int DEFAULT 30,
  default_payment_terms text DEFAULT 'Paiement à 30 jours à compter de la date de facture.',
  default_quote_footer text DEFAULT 'Acompte de 30% à la commande. Solde à la fin des travaux.',
  -- Numérotation auto
  quote_number_prefix text DEFAULT 'DEV',
  next_quote_number int DEFAULT 1,
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE quote_settings IS 'Paramètres devis par artisan : logo, mentions légales, RIB, défauts. 1 ligne par client_id.';


-- ════════════════════════════════════════════════════════════════════
-- 2. quotes (1 par devis)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  quote_number text NOT NULL,            -- ex: "DEV-2026-0042"

  -- Lien optionnel avec un lead du portail
  portal_lead_id uuid REFERENCES portal_leads(id) ON DELETE SET NULL,

  -- Destinataire du devis (le client final de l'artisan, pas l'artisan)
  recipient_name text NOT NULL,
  recipient_address text,
  recipient_postal_code text,
  recipient_city text,
  recipient_phone text,
  recipient_email text,

  -- Dates
  issued_at date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date NOT NULL,

  -- Statut
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'signed', 'refused', 'expired')),

  -- Totaux (recalculés par trigger depuis quote_items)
  total_ht numeric NOT NULL DEFAULT 0,
  total_tva numeric NOT NULL DEFAULT 0,
  total_ttc numeric NOT NULL DEFAULT 0,

  -- Notes
  internal_notes text,                   -- notes privées artisan
  client_message text,                   -- message envoyé au client
  payment_terms text,                    -- snapshot des conditions au moment T
  footer_notes text,                     -- snapshot du footer (acompte, etc.)

  -- Signature client
  signed_at timestamptz,
  signed_pdf_path text,                  -- PDF signé uploadé dans storage
  signed_signature_data text,            -- data URL canvas (optionnel)

  -- Tracking
  sent_at timestamptz,
  viewed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  UNIQUE(client_id, quote_number)
);

CREATE INDEX IF NOT EXISTS idx_quotes_client_id ON quotes(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(client_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_portal_lead ON quotes(portal_lead_id) WHERE deleted_at IS NULL;


-- ════════════════════════════════════════════════════════════════════
-- 3. quote_items (lignes du devis)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'unité',    -- m², m³, ml, h, jour, forfait, pièce
  unit_price_ht numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 20,
  -- Totaux ligne (recalculés par trigger)
  total_ht numeric NOT NULL DEFAULT 0,
  total_tva numeric NOT NULL DEFAULT 0,
  total_ttc numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id, position);


-- ════════════════════════════════════════════════════════════════════
-- 4. quote_item_library (bibliothèque de prestations réutilisables)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quote_item_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  label text NOT NULL,                   -- ex: "Pose chauffe-eau électrique"
  description text,                      -- détail long, sera copié dans quote_items.description
  default_unit text DEFAULT 'unité',
  default_unit_price_ht numeric DEFAULT 0,
  default_vat_rate numeric DEFAULT 20,
  usage_count int DEFAULT 0,             -- pour trier par fréquence d'usage
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_item_library_client ON quote_item_library(client_id);


-- ════════════════════════════════════════════════════════════════════
-- 5. Triggers : recalcul auto des totaux + updated_at
-- ════════════════════════════════════════════════════════════════════

-- Recalcule les totaux d'une ligne avant INSERT/UPDATE
CREATE OR REPLACE FUNCTION compute_quote_item_totals()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_ht := ROUND(NEW.quantity * NEW.unit_price_ht, 2);
  NEW.total_tva := ROUND(NEW.total_ht * NEW.vat_rate / 100, 2);
  NEW.total_ttc := NEW.total_ht + NEW.total_tva;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compute_quote_item_totals ON quote_items;
CREATE TRIGGER trg_compute_quote_item_totals
  BEFORE INSERT OR UPDATE ON quote_items
  FOR EACH ROW EXECUTE FUNCTION compute_quote_item_totals();

-- Recalcule les totaux d'un devis après changement de ses lignes
CREATE OR REPLACE FUNCTION recompute_quote_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_quote_id uuid;
BEGIN
  v_quote_id := COALESCE(NEW.quote_id, OLD.quote_id);
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE quotes SET
    total_ht  = COALESCE((SELECT SUM(total_ht)  FROM quote_items WHERE quote_id = v_quote_id), 0),
    total_tva = COALESCE((SELECT SUM(total_tva) FROM quote_items WHERE quote_id = v_quote_id), 0),
    total_ttc = COALESCE((SELECT SUM(total_ttc) FROM quote_items WHERE quote_id = v_quote_id), 0),
    updated_at = now()
  WHERE id = v_quote_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recompute_quote_totals ON quote_items;
CREATE TRIGGER trg_recompute_quote_totals
  AFTER INSERT OR UPDATE OR DELETE ON quote_items
  FOR EACH ROW EXECUTE FUNCTION recompute_quote_totals();

-- Auto-numérotation des devis : DEV-2026-0001, DEV-2026-0002, ...
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
DECLARE
  v_prefix text;
  v_year int;
  v_n int;
BEGIN
  IF NEW.quote_number IS NOT NULL AND NEW.quote_number <> '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(quote_number_prefix, 'DEV'), COALESCE(next_quote_number, 1)
    INTO v_prefix, v_n
  FROM quote_settings
  WHERE client_id = NEW.client_id;

  IF v_prefix IS NULL THEN
    v_prefix := 'DEV';
    v_n := 1;
    -- Crée la ligne quote_settings si absente
    INSERT INTO quote_settings (client_id) VALUES (NEW.client_id) ON CONFLICT DO NOTHING;
  END IF;

  v_year := EXTRACT(YEAR FROM NEW.issued_at)::int;
  NEW.quote_number := format('%s-%s-%s', v_prefix, v_year, LPAD(v_n::text, 4, '0'));

  -- Incrémente le compteur
  UPDATE quote_settings SET next_quote_number = v_n + 1 WHERE client_id = NEW.client_id;

  -- valid_until par défaut si non défini
  IF NEW.valid_until IS NULL THEN
    NEW.valid_until := NEW.issued_at + INTERVAL '30 days';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_quote_number ON quotes;
CREATE TRIGGER trg_generate_quote_number
  BEFORE INSERT ON quotes
  FOR EACH ROW EXECUTE FUNCTION generate_quote_number();

-- updated_at auto sur quotes
DROP TRIGGER IF EXISTS trg_quotes_updated_at ON quotes;
CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- updated_at auto sur quote_settings + quote_item_library
DROP TRIGGER IF EXISTS trg_quote_settings_updated_at ON quote_settings;
CREATE TRIGGER trg_quote_settings_updated_at
  BEFORE UPDATE ON quote_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_quote_item_library_updated_at ON quote_item_library;
CREATE TRIGGER trg_quote_item_library_updated_at
  BEFORE UPDATE ON quote_item_library
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ════════════════════════════════════════════════════════════════════
-- 6. Sync devis signé → portal_leads (le lead bascule en 'signe')
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sync_signed_quote_to_lead()
RETURNS TRIGGER AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  -- Bascule lead → 'signe' quand un devis lié devient signé
  IF NEW.status = 'signed' AND COALESCE(OLD.status, '') <> 'signed' AND NEW.portal_lead_id IS NOT NULL THEN
    UPDATE portal_leads SET
      status = 'signe',
      signed_amount = NEW.total_ht,
      signed_at = COALESCE(NEW.signed_at::date, CURRENT_DATE),
      signed_pdf_path = NEW.signed_pdf_path,
      updated_at = now()
    WHERE id = NEW.portal_lead_id
      AND status <> 'signe';  -- n'écrase pas un montant déjà set
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_signed_quote_to_lead ON quotes;
CREATE TRIGGER trg_sync_signed_quote_to_lead
  AFTER UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION sync_signed_quote_to_lead();


-- ════════════════════════════════════════════════════════════════════
-- 7. RLS — artisan voit ses devis, founders voient tout
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE quote_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_item_library ENABLE ROW LEVEL SECURITY;

-- quote_settings
CREATE POLICY quote_settings_admin_all ON quote_settings FOR ALL USING (is_founder()) WITH CHECK (is_founder());
CREATE POLICY quote_settings_artisan_select ON quote_settings FOR SELECT USING (
  client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
);
CREATE POLICY quote_settings_artisan_insert ON quote_settings FOR INSERT WITH CHECK (
  client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
);
CREATE POLICY quote_settings_artisan_update ON quote_settings FOR UPDATE USING (
  client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
) WITH CHECK (
  client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
);

-- quotes
CREATE POLICY quotes_admin_all ON quotes FOR ALL USING (is_founder()) WITH CHECK (is_founder());
CREATE POLICY quotes_artisan_select ON quotes FOR SELECT USING (
  deleted_at IS NULL AND client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
);
CREATE POLICY quotes_artisan_insert ON quotes FOR INSERT WITH CHECK (
  client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
);
CREATE POLICY quotes_artisan_update ON quotes FOR UPDATE USING (
  client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
) WITH CHECK (
  client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
);

-- quote_items (via quote_id → client_id)
CREATE POLICY quote_items_admin_all ON quote_items FOR ALL USING (is_founder()) WITH CHECK (is_founder());
CREATE POLICY quote_items_artisan_all ON quote_items FOR ALL USING (
  quote_id IN (SELECT id FROM quotes WHERE client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()))
) WITH CHECK (
  quote_id IN (SELECT id FROM quotes WHERE client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()))
);

-- quote_item_library
CREATE POLICY library_admin_all ON quote_item_library FOR ALL USING (is_founder()) WITH CHECK (is_founder());
CREATE POLICY library_artisan_all ON quote_item_library FOR ALL USING (
  client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
) WITH CHECK (
  client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
);


-- ════════════════════════════════════════════════════════════════════
-- 8. Storage bucket portal-quotes (logos + PDFs signés)
-- ════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
  VALUES ('portal-quotes', 'portal-quotes', false)
  ON CONFLICT (id) DO NOTHING;

-- Policies : artisan accède aux fichiers sous {client_id}/* uniquement
CREATE POLICY quotes_storage_admin ON storage.objects FOR ALL
  USING (bucket_id = 'portal-quotes' AND public.is_founder())
  WITH CHECK (bucket_id = 'portal-quotes' AND public.is_founder());

CREATE POLICY quotes_storage_artisan_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'portal-quotes'
    AND (storage.foldername(name))[1] IN (SELECT id::text FROM clients WHERE user_id = auth.uid())
  );

CREATE POLICY quotes_storage_artisan_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'portal-quotes'
    AND (storage.foldername(name))[1] IN (SELECT id::text FROM clients WHERE user_id = auth.uid())
  );

CREATE POLICY quotes_storage_artisan_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'portal-quotes'
    AND (storage.foldername(name))[1] IN (SELECT id::text FROM clients WHERE user_id = auth.uid())
  )
  WITH CHECK (
    bucket_id = 'portal-quotes'
    AND (storage.foldername(name))[1] IN (SELECT id::text FROM clients WHERE user_id = auth.uid())
  );

CREATE POLICY quotes_storage_artisan_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'portal-quotes'
    AND (storage.foldername(name))[1] IN (SELECT id::text FROM clients WHERE user_id = auth.uid())
  );


-- ════════════════════════════════════════════════════════════════════
-- 9. Realtime sur quotes pour mise à jour live
-- ════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE quotes;
