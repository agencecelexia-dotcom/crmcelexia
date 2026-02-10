-- ============================================
-- CRM CELEXIA — Database Functions & Triggers
-- ============================================

-- ============ TRIGGER: Update prospect stats after call ============

CREATE OR REPLACE FUNCTION update_prospect_call_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE prospects SET
    call_count = call_count + 1,
    last_called_at = NEW.called_at,
    status = NEW.new_status
  WHERE id = NEW.prospect_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_call_insert
  AFTER INSERT ON calls
  FOR EACH ROW EXECUTE FUNCTION update_prospect_call_stats();

-- ============ TRIGGER: Update prospect next_reminder_at ============

CREATE OR REPLACE FUNCTION update_prospect_next_reminder()
RETURNS TRIGGER AS $$
DECLARE
  prospect_uuid UUID;
  next_remind TIMESTAMPTZ;
BEGIN
  -- Determine which prospect to update
  IF TG_OP = 'DELETE' THEN
    prospect_uuid := OLD.prospect_id;
  ELSE
    prospect_uuid := NEW.prospect_id;
  END IF;

  -- Find the next uncompleted reminder
  SELECT MIN(remind_at) INTO next_remind
  FROM reminders
  WHERE prospect_id = prospect_uuid
    AND is_completed = false;

  UPDATE prospects SET next_reminder_at = next_remind
  WHERE id = prospect_uuid;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_reminder_change
  AFTER INSERT OR UPDATE OR DELETE ON reminders
  FOR EACH ROW EXECUTE FUNCTION update_prospect_next_reminder();

-- ============ FUNCTION: Log call and update prospect (RPC) ============

CREATE OR REPLACE FUNCTION log_call_and_update_prospect(
  p_prospect_id UUID,
  p_commercial_id UUID,
  p_result call_result,
  p_new_status prospect_status,
  p_note TEXT DEFAULT NULL,
  p_duration_seconds INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_previous_status prospect_status;
  v_call_id UUID;
BEGIN
  -- Get current prospect status
  SELECT status INTO v_previous_status
  FROM prospects WHERE id = p_prospect_id;

  IF v_previous_status IS NULL THEN
    RAISE EXCEPTION 'Prospect not found: %', p_prospect_id;
  END IF;

  -- Insert call record
  INSERT INTO calls (prospect_id, commercial_id, result, previous_status, new_status, note, duration_seconds)
  VALUES (p_prospect_id, p_commercial_id, p_result, v_previous_status, p_new_status, p_note, p_duration_seconds)
  RETURNING id INTO v_call_id;

  -- Log event
  INSERT INTO event_log (event_type, entity_type, entity_id, actor_id, old_values, new_values)
  VALUES (
    'call.logged',
    'call',
    v_call_id,
    p_commercial_id,
    NULL,
    jsonb_build_object(
      'result', p_result::text,
      'previous_status', v_previous_status::text,
      'new_status', p_new_status::text,
      'note', p_note
    )
  );

  -- Log status change if different
  IF v_previous_status != p_new_status THEN
    INSERT INTO event_log (event_type, entity_type, entity_id, actor_id, old_values, new_values)
    VALUES (
      'prospect.status_changed',
      'prospect',
      p_prospect_id,
      p_commercial_id,
      jsonb_build_object('status', v_previous_status::text),
      jsonb_build_object('status', p_new_status::text)
    );
  END IF;

  RETURN v_call_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ FUNCTION: Convert prospect to client ============

CREATE OR REPLACE FUNCTION convert_prospect_to_client(
  p_prospect_id UUID,
  p_project_name TEXT DEFAULT 'Projet principal'
)
RETURNS UUID AS $$
DECLARE
  v_prospect RECORD;
  v_client_id UUID;
  v_project_id UUID;
BEGIN
  -- Get prospect data
  SELECT * INTO v_prospect FROM prospects WHERE id = p_prospect_id;

  IF v_prospect IS NULL THEN
    RAISE EXCEPTION 'Prospect not found: %', p_prospect_id;
  END IF;

  IF v_prospect.status = 'converti_client' THEN
    RAISE EXCEPTION 'Prospect already converted';
  END IF;

  -- Create client
  INSERT INTO clients (
    prospect_id, company_name, contact_name, contact_firstname,
    contact_email, phone, profession, city, address, website,
    commercial_id, source
  ) VALUES (
    v_prospect.id, v_prospect.company_name, v_prospect.contact_name,
    v_prospect.contact_firstname, v_prospect.contact_email, v_prospect.phone,
    v_prospect.profession, v_prospect.city, v_prospect.address, v_prospect.website,
    v_prospect.commercial_id, v_prospect.source
  ) RETURNING id INTO v_client_id;

  -- Create project
  INSERT INTO projects (client_id, name)
  VALUES (v_client_id, p_project_name)
  RETURNING id INTO v_project_id;

  -- Update prospect
  UPDATE prospects SET
    status = 'converti_client',
    converted_at = now(),
    client_id = v_client_id
  WHERE id = p_prospect_id;

  -- Log events
  INSERT INTO event_log (event_type, entity_type, entity_id, actor_id, new_values)
  VALUES
    ('client.created', 'client', v_client_id, auth.uid(),
     jsonb_build_object('prospect_id', p_prospect_id, 'company_name', v_prospect.company_name)),
    ('prospect.converted', 'prospect', p_prospect_id, auth.uid(),
     jsonb_build_object('client_id', v_client_id)),
    ('project.created', 'project', v_project_id, auth.uid(),
     jsonb_build_object('client_id', v_client_id, 'name', p_project_name));

  RETURN v_client_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ FUNCTION: Generate devis reference ============

CREATE OR REPLACE FUNCTION generate_devis_reference()
RETURNS TRIGGER AS $$
DECLARE
  v_year TEXT;
  v_count INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM now())::TEXT;

  SELECT COUNT(*) + 1 INTO v_count
  FROM devis
  WHERE reference LIKE 'DEV-' || v_year || '-%';

  NEW.reference := 'DEV-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER before_devis_insert
  BEFORE INSERT ON devis
  FOR EACH ROW
  WHEN (NEW.reference IS NULL OR NEW.reference = '')
  EXECUTE FUNCTION generate_devis_reference();

-- ============ FUNCTION: Get funnel stats ============

CREATE OR REPLACE FUNCTION get_funnel_stats(
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_commercial_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_date_from TIMESTAMPTZ := COALESCE(p_date_from, '2000-01-01'::TIMESTAMPTZ);
  v_date_to TIMESTAMPTZ := COALESCE(p_date_to, now());
BEGIN
  SELECT jsonb_build_object(
    'prospects_imported', (
      SELECT COUNT(*) FROM prospects
      WHERE created_at BETWEEN v_date_from AND v_date_to
        AND deleted_at IS NULL
        AND (p_commercial_id IS NULL OR commercial_id = p_commercial_id)
    ),
    'prospects_called', (
      SELECT COUNT(DISTINCT prospect_id) FROM calls
      WHERE called_at BETWEEN v_date_from AND v_date_to
        AND (p_commercial_id IS NULL OR commercial_id = p_commercial_id)
    ),
    'prospects_reached', (
      SELECT COUNT(DISTINCT prospect_id) FROM calls
      WHERE called_at BETWEEN v_date_from AND v_date_to
        AND result IN ('reached_interested', 'reached_not_interested', 'reached_callback', 'reached_rdv')
        AND (p_commercial_id IS NULL OR commercial_id = p_commercial_id)
    ),
    'prospects_interested', (
      SELECT COUNT(DISTINCT entity_id) FROM event_log
      WHERE event_type = 'prospect.status_changed'
        AND (new_values->>'status') = 'interesse'
        AND created_at BETWEEN v_date_from AND v_date_to
        AND (p_commercial_id IS NULL OR actor_id = p_commercial_id)
    ),
    'rdv_booked', (
      SELECT COUNT(*) FROM rendez_vous
      WHERE created_at BETWEEN v_date_from AND v_date_to
        AND deleted_at IS NULL
        AND (p_commercial_id IS NULL OR commercial_id = p_commercial_id)
    ),
    'rdv_showed_up', (
      SELECT COUNT(*) FROM rendez_vous
      WHERE status = 'fait'
        AND updated_at BETWEEN v_date_from AND v_date_to
        AND deleted_at IS NULL
        AND (p_commercial_id IS NULL OR commercial_id = p_commercial_id)
    ),
    'devis_signed', (
      SELECT COUNT(*) FROM devis
      WHERE status = 'signe'
        AND signed_at BETWEEN v_date_from AND v_date_to
        AND deleted_at IS NULL
    ),
    'total_revenue', (
      SELECT COALESCE(SUM(amount_ttc), 0) FROM devis
      WHERE status = 'signe'
        AND signed_at BETWEEN v_date_from AND v_date_to
        AND deleted_at IS NULL
    ),
    'total_calls', (
      SELECT COUNT(*) FROM calls
      WHERE called_at BETWEEN v_date_from AND v_date_to
        AND (p_commercial_id IS NULL OR commercial_id = p_commercial_id)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ FUNCTION: Get commercial KPIs ============

CREATE OR REPLACE FUNCTION get_commercial_kpis(
  p_commercial_id UUID,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_date_from TIMESTAMPTZ := COALESCE(p_date_from, date_trunc('week', now()));
  v_date_to TIMESTAMPTZ := COALESCE(p_date_to, now());
  v_total_calls INTEGER;
  v_reached_calls INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_calls
  FROM calls
  WHERE commercial_id = p_commercial_id
    AND called_at BETWEEN v_date_from AND v_date_to;

  SELECT COUNT(*) INTO v_reached_calls
  FROM calls
  WHERE commercial_id = p_commercial_id
    AND called_at BETWEEN v_date_from AND v_date_to
    AND result IN ('reached_interested', 'reached_not_interested', 'reached_callback', 'reached_rdv');

  RETURN jsonb_build_object(
    'total_calls', v_total_calls,
    'calls_today', (
      SELECT COUNT(*) FROM calls
      WHERE commercial_id = p_commercial_id
        AND called_at >= date_trunc('day', now())
    ),
    'pickup_rate', CASE WHEN v_total_calls > 0
      THEN ROUND((v_reached_calls::numeric / v_total_calls) * 100, 1)
      ELSE 0 END,
    'rdv_count', (
      SELECT COUNT(*) FROM rendez_vous
      WHERE commercial_id = p_commercial_id
        AND created_at BETWEEN v_date_from AND v_date_to
        AND deleted_at IS NULL
    ),
    'show_up_rate', (
      SELECT CASE WHEN COUNT(*) FILTER (WHERE status IN ('fait', 'no_show')) > 0
        THEN ROUND(
          (COUNT(*) FILTER (WHERE status = 'fait')::numeric /
           COUNT(*) FILTER (WHERE status IN ('fait', 'no_show'))) * 100, 1)
        ELSE 0 END
      FROM rendez_vous
      WHERE commercial_id = p_commercial_id
        AND scheduled_at BETWEEN v_date_from AND v_date_to
        AND deleted_at IS NULL
    ),
    'reminders_pending', (
      SELECT COUNT(*) FROM reminders
      WHERE commercial_id = p_commercial_id
        AND is_completed = false
    ),
    'reminders_overdue', (
      SELECT COUNT(*) FROM reminders
      WHERE commercial_id = p_commercial_id
        AND is_completed = false
        AND remind_at < now()
    ),
    'prospects_active', (
      SELECT COUNT(*) FROM prospects
      WHERE commercial_id = p_commercial_id
        AND status NOT IN ('negatif', 'perdu', 'converti_client')
        AND deleted_at IS NULL
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
