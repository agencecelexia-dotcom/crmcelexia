-- Migrate existing 'interesse' prospects to 'site_envoye' (must be separate transaction from ALTER TYPE)
UPDATE prospects SET status = 'site_envoye', date_envoi_site = created_at::date WHERE status = 'interesse';

-- Update get_funnel_stats to count site_en_attente/site_envoye instead of interesse
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
        AND (new_values->>'status') IN ('site_en_attente', 'site_envoye')
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
