-- Temporary function to check opportunity counts (will be dropped after check)
CREATE OR REPLACE FUNCTION public.temp_check_opp_counts()
RETURNS TABLE(status text, cnt bigint)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT status::text, count(*) as cnt FROM opportunities GROUP BY status ORDER BY cnt DESC;
$$;

-- Also check prospect counts for eligible statuses
CREATE OR REPLACE FUNCTION public.temp_check_prospect_pipeline()
RETURNS TABLE(status text, cnt bigint, has_commercial bigint)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    status::text,
    count(*) as cnt,
    count(commercial_id) as has_commercial
  FROM prospects
  WHERE status IN ('site_en_attente', 'site_envoye', 'rdv_pris', 'converti_client', 'perdu')
    AND deleted_at IS NULL
  GROUP BY status
  ORDER BY cnt DESC;
$$;
