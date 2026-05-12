-- ════════════════════════════════════════════════════════════════════
-- 00091 — portal_leads : ajout email / address / postal_code
-- + extension du sync sync_signed_quote_to_lead pour propager les
-- coordonnées du devis vers le lead à la signature.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE portal_leads
  ADD COLUMN IF NOT EXISTS email       text,
  ADD COLUMN IF NOT EXISTS address     text,
  ADD COLUMN IF NOT EXISTS postal_code text;

COMMENT ON COLUMN portal_leads.email       IS 'Email du destinataire (alimenté manuellement ou par le sync devis signé).';
COMMENT ON COLUMN portal_leads.address     IS 'Adresse postale (rue + numéro), hors CP/ville.';
COMMENT ON COLUMN portal_leads.postal_code IS 'Code postal du chantier.';

-- Extension du sync : on backfille email/address/postal_code/city/phone
-- depuis les recipient_* du devis quand le lead n'a pas encore ces infos.
-- Ne JAMAIS écraser une valeur déjà présente côté lead (COALESCE).
CREATE OR REPLACE FUNCTION sync_signed_quote_to_lead()
RETURNS TRIGGER AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'signed'
     AND COALESCE(OLD.status, '') <> 'signed'
     AND NEW.portal_lead_id IS NOT NULL THEN
    UPDATE portal_leads SET
      status          = 'signe',
      signed_amount   = NEW.total_ht,
      signed_at       = COALESCE(NEW.signed_at::date, CURRENT_DATE),
      signed_pdf_path = NEW.signed_pdf_path,
      email           = COALESCE(email,                     NEW.recipient_email),
      address         = COALESCE(address,                   NEW.recipient_address),
      postal_code     = COALESCE(postal_code,               NEW.recipient_postal_code),
      city            = COALESCE(city,                      NEW.recipient_city),
      phone           = COALESCE(NULLIF(phone, ''),         NEW.recipient_phone),
      updated_at      = now()
    WHERE id = NEW.portal_lead_id
      AND status <> 'signe';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Trigger trg_sync_signed_quote_to_lead déjà attaché par 00090.
