-- Met à jour le trigger on_rdv_confirmation_set pour utiliser la bonne URL Cal.com
-- (le slug correct est 'apport-d-affaires', pas 'celexia/30min')

CREATE OR REPLACE FUNCTION on_rdv_confirmation_set()
RETURNS TRIGGER AS $$
DECLARE
  v_rdv rendez_vous%ROWTYPE;
  v_prospect prospects%ROWTYPE;
  v_payload JSONB;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.confirmed_at IS NULL OR OLD.confirmed_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_rdv FROM rendez_vous WHERE id = NEW.rdv_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF v_rdv.status = 'prevu' THEN
    UPDATE rendez_vous SET status = 'confirme' WHERE id = v_rdv.id;
  END IF;

  SELECT * INTO v_prospect FROM prospects WHERE id = v_rdv.prospect_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_payload := jsonb_build_object(
    'prospect_id', v_prospect.id,
    'prospect_firstname', COALESCE(v_prospect.contact_firstname, ''),
    'prospect_lastname', COALESCE(v_prospect.contact_name, ''),
    'prospect_company', v_prospect.company_name,
    'prospect_profession', COALESCE(v_prospect.profession, '—'),
    'prospect_city', COALESCE(v_prospect.city, '—'),
    'prospect_phone', v_prospect.phone,
    'prospect_email', COALESCE(v_prospect.contact_email, '—'),
    'rdv_id', v_rdv.id,
    'meeting_url', COALESCE(v_rdv.meeting_url, 'https://cal.com/agence-celexia-1qyn93/apport-d-affaires')
  );

  INSERT INTO email_schedule (
    rdv_id, prospect_id, recipient_email, recipient_name, email_type,
    scheduled_at, payload, status
  ) VALUES (
    v_rdv.id, v_prospect.id, 'agence.celexia@gmail.com', 'Celexia',
    'internal_rdv_confirmed', now() + INTERVAL '1 minute', v_payload, 'scheduled'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
