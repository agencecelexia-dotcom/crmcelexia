-- RPC qui rejoue la logique du trigger schedule_rdv_emails sur un RDV existant.
-- Utile quand le trigger a skip à l'INSERT (ex: prospect.contact_email était NULL)
-- et qu'on veut re-programmer les emails après avoir backfillé le champ manquant.
--
-- Usage :  SELECT reschedule_rdv_emails('<rdv-uuid>');

CREATE OR REPLACE FUNCTION reschedule_rdv_emails(p_rdv_id UUID)
RETURNS jsonb AS $$
DECLARE
  v_rdv rendez_vous%ROWTYPE;
  v_prospect prospects%ROWTYPE;
  v_email TEXT;
  v_recipient_name TEXT;
  v_now TIMESTAMPTZ := now();
  v_token TEXT;
  v_confirmation_expires_at TIMESTAMPTZ;
  v_hours_until_rdv NUMERIC;
  v_confirm_at TIMESTAMPTZ;
  v_confirm_reminder_1_at TIMESTAMPTZ;
  v_confirm_reminder_2_at TIMESTAMPTZ;
  v_trust_at TIMESTAMPTZ;
  v_tomorrow_at TIMESTAMPTZ;
  v_count INT := 0;
BEGIN
  -- Charge le RDV
  SELECT * INTO v_rdv FROM rendez_vous WHERE id = p_rdv_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rdv_not_found');
  END IF;
  IF v_rdv.external_booking_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_calcom_booking');
  END IF;
  IF v_rdv.status IN ('annule', 'no_show', 'perdu') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rdv_cancelled_or_lost', 'status', v_rdv.status);
  END IF;

  -- Charge le prospect
  SELECT * INTO v_prospect FROM prospects WHERE id = v_rdv.prospect_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'prospect_not_found');
  END IF;

  v_email := v_prospect.contact_email;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'prospect_email_null');
  END IF;

  v_recipient_name := COALESCE(
    NULLIF(TRIM(CONCAT_WS(' ', v_prospect.contact_firstname, v_prospect.contact_name)), ''),
    v_prospect.company_name
  );

  -- Cleanup : supprime les emails déjà programmés (mais pas ceux déjà sent)
  DELETE FROM email_schedule
    WHERE rdv_id = p_rdv_id
      AND status IN ('scheduled', 'failed')
      AND email_type IN ('rdv_confirmation', 'rdv_confirmation_reminder',
                         'rdv_trust_builder', 'rdv_tomorrow');

  -- Token de confirmation : réutilise s'il existe, sinon en crée un
  SELECT token INTO v_token FROM rdv_confirmations WHERE rdv_id = p_rdv_id;
  IF v_token IS NULL THEN
    v_token := encode(gen_random_bytes(16), 'hex');
    v_confirmation_expires_at := v_rdv.scheduled_at + INTERVAL '7 days';
    INSERT INTO rdv_confirmations (rdv_id, token, expires_at)
      VALUES (p_rdv_id, v_token, v_confirmation_expires_at)
      ON CONFLICT (rdv_id) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at;
  END IF;

  -- Calcul distance temporelle
  v_hours_until_rdv := EXTRACT(EPOCH FROM (v_rdv.scheduled_at - v_now)) / 3600;

  -- RDV déjà passé → on ne re-programme rien (RDV à statuer manuellement)
  IF v_hours_until_rdv < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rdv_past', 'hours', v_hours_until_rdv);
  END IF;

  -- Stratégie adaptative selon distance (copie du trigger schedule_rdv_emails)
  IF v_hours_until_rdv >= 72 THEN
    v_confirm_at := v_now + INTERVAL '5 minutes';
    v_confirm_reminder_1_at := v_now + INTERVAL '24 hours';
    v_confirm_reminder_2_at := v_now + INTERVAL '48 hours';
    v_trust_at := v_rdv.scheduled_at - INTERVAL '48 hours';
    v_tomorrow_at := v_rdv.scheduled_at - INTERVAL '24 hours';
  ELSIF v_hours_until_rdv >= 48 THEN
    v_confirm_at := v_now + INTERVAL '5 minutes';
    v_confirm_reminder_1_at := v_now + INTERVAL '12 hours';
    v_confirm_reminder_2_at := NULL;
    v_trust_at := NULL;
    v_tomorrow_at := v_rdv.scheduled_at - INTERVAL '24 hours';
  ELSIF v_hours_until_rdv >= 24 THEN
    v_confirm_at := v_now + INTERVAL '5 minutes';
    v_confirm_reminder_1_at := v_now + INTERVAL '8 hours';
    v_confirm_reminder_2_at := NULL;
    v_trust_at := NULL;
    v_tomorrow_at := v_rdv.scheduled_at - INTERVAL '12 hours';
  ELSIF v_hours_until_rdv >= 6 THEN
    v_confirm_at := v_now + INTERVAL '2 minutes';
    v_confirm_reminder_1_at := v_rdv.scheduled_at - INTERVAL '2 hours';
    v_confirm_reminder_2_at := NULL;
    v_trust_at := NULL;
    v_tomorrow_at := NULL;
  ELSE
    v_confirm_at := v_now + INTERVAL '1 minute';
    v_confirm_reminder_1_at := NULL;
    v_confirm_reminder_2_at := NULL;
    v_trust_at := NULL;
    v_tomorrow_at := NULL;
  END IF;

  -- Insert les emails
  INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
    VALUES (v_rdv.id, v_rdv.prospect_id, v_email, v_recipient_name, 'rdv_confirmation', v_confirm_at, jsonb_build_object('token', v_token), 'scheduled');
  v_count := v_count + 1;

  IF v_confirm_reminder_1_at IS NOT NULL THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
      VALUES (v_rdv.id, v_rdv.prospect_id, v_email, v_recipient_name, 'rdv_confirmation_reminder', v_confirm_reminder_1_at, jsonb_build_object('token', v_token, 'reminder_number', 1), 'scheduled');
    v_count := v_count + 1;
  END IF;

  IF v_confirm_reminder_2_at IS NOT NULL THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
      VALUES (v_rdv.id, v_rdv.prospect_id, v_email, v_recipient_name, 'rdv_confirmation_reminder', v_confirm_reminder_2_at, jsonb_build_object('token', v_token, 'reminder_number', 2), 'scheduled');
    v_count := v_count + 1;
  END IF;

  IF v_trust_at IS NOT NULL THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
      VALUES (v_rdv.id, v_rdv.prospect_id, v_email, v_recipient_name, 'rdv_trust_builder', v_trust_at, jsonb_build_object('token', v_token), 'scheduled');
    v_count := v_count + 1;
  END IF;

  IF v_tomorrow_at IS NOT NULL THEN
    INSERT INTO email_schedule (rdv_id, prospect_id, recipient_email, recipient_name, email_type, scheduled_at, payload, status)
      VALUES (v_rdv.id, v_rdv.prospect_id, v_email, v_recipient_name, 'rdv_tomorrow', v_tomorrow_at, jsonb_build_object('token', v_token), 'scheduled');
    v_count := v_count + 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'rdv_id', p_rdv_id,
    'emails_scheduled', v_count,
    'recipient', v_email,
    'hours_until_rdv', ROUND(v_hours_until_rdv, 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION reschedule_rdv_emails(UUID) TO service_role;
