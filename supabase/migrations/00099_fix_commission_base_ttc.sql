-- ════════════════════════════════════════════════════════════════════
-- 00099 — Fix base de calcul commission TTC vs HT
--
-- Cowork a relevé : devis 10 000 € HT / 12 000 € TTC, commission rate
-- 10% TTC → la commission affichée est 1 000 € au lieu de 1 200 €.
-- Cause : le trigger sync_signed_quote_to_lead fixait toujours
-- signed_amount = NEW.total_ht. Or commission_amount est calculé via
-- la colonne générée signed_amount * commission_rate ; pour un
-- artisan en base TTC, il faut donc stocker le total_ttc.
--
-- Fix : le trigger lit clients.commission_base et choisit la bonne
-- valeur. Backfill sur les leads déjà signés du seed Aquastyle.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sync_signed_quote_to_lead()
RETURNS TRIGGER AS $$
DECLARE
  v_base text;
  v_amount numeric(12, 2);
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'signed'
     AND COALESCE(OLD.status, '') <> 'signed'
     AND NEW.portal_lead_id IS NOT NULL THEN
    -- Récupère la base contractuelle (HT par défaut si pas configuré).
    SELECT COALESCE(c.commission_base, 'HT') INTO v_base
      FROM portal_leads l
      JOIN clients c ON c.id = l.client_id
     WHERE l.id = NEW.portal_lead_id;
    v_amount := CASE WHEN v_base = 'TTC' THEN NEW.total_ttc ELSE NEW.total_ht END;

    UPDATE portal_leads SET
      status          = 'signe',
      signed_amount   = v_amount,
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

-- Pas de backfill : les leads signés existants ont déjà signed_amount
-- aligné sur le total_ttc du devis (le seed initial le faisait
-- correctement). Le trigger corrigé ci-dessus prend effet pour les
-- futures signatures (artisans en base TTC).
