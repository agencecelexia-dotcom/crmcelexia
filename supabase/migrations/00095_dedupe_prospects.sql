-- ════════════════════════════════════════════════════════════════════
-- 00095 — Dédoublonnage des prospects
--
-- Détecte les prospects en doublon par numéro de téléphone normalisé
-- (chiffres uniquement, +33 → 0) et soft-delete les copies inutiles
-- en gardant celle qui contient le plus d'historique métier.
--
-- Priorité de conservation (du plus fort au plus faible) :
--   4. A déjà un client_id (déjà devenu client)
--   3. A au moins une opportunity active (deleted_at IS NULL)
--   2. A été appelé (call_count > 0 OU last_called_at IS NOT NULL)
--   1. Aucun signal
-- Tiebreak : created_at le plus ancien gagne (plus d'historique potentiel).
--
-- Deux RPC :
--   • find_duplicate_prospects() — DRY-RUN, ne touche à rien
--   • dedupe_prospects()         — soft-delete (deleted_at = now())
--
-- Sécurité : réservé aux founders.
-- ════════════════════════════════════════════════════════════════════

-- ---------- helper : normalisation téléphone ------------------------
CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p IS NULL OR btrim(p) = '' THEN NULL
    -- Format français +33 X XX XX XX XX → 0X XX XX XX XX
    WHEN regexp_replace(p, '\D', '', 'g') ~ '^33\d{9}$'
      THEN '0' || substring(regexp_replace(p, '\D', '', 'g') from 3)
    ELSE regexp_replace(p, '\D', '', 'g')
  END
$$;

-- ---------- DRY-RUN : liste les doublons à supprimer ----------------
CREATE OR REPLACE FUNCTION public.find_duplicate_prospects()
RETURNS TABLE (
  phone_normalized       text,
  group_size             int,
  kept_id                uuid,
  kept_company_name      text,
  kept_call_count        int,
  kept_last_called_at    timestamptz,
  kept_created_at        timestamptz,
  to_delete_ids          uuid[],
  to_delete_companies    text[],
  to_delete_call_counts  int[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'Réservé aux founders.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      p.id,
      p.company_name,
      p.call_count,
      p.last_called_at,
      p.created_at,
      public.normalize_phone(p.phone) AS phone_n,
      -- score de priorité (plus haut = on garde)
      (CASE WHEN p.client_id IS NOT NULL THEN 1000 ELSE 0 END
       + CASE WHEN EXISTS (
           SELECT 1 FROM opportunities o
            WHERE o.prospect_id = p.id AND o.deleted_at IS NULL
         ) THEN 100 ELSE 0 END
       + CASE WHEN p.call_count > 0 OR p.last_called_at IS NOT NULL THEN 10 ELSE 0 END
      ) AS priority_score
    FROM prospects p
    WHERE p.deleted_at IS NULL
      AND p.phone IS NOT NULL
      AND public.normalize_phone(p.phone) <> ''
      AND public.normalize_phone(p.phone) IS NOT NULL
  ),
  groups AS (
    SELECT phone_n
    FROM ranked
    GROUP BY phone_n
    HAVING COUNT(*) > 1
  ),
  ordered AS (
    SELECT
      r.*,
      ROW_NUMBER() OVER (
        PARTITION BY r.phone_n
        -- on garde le plus prioritaire ; à égalité, le plus ancien
        ORDER BY r.priority_score DESC, r.created_at ASC, r.id ASC
      ) AS rk
    FROM ranked r
    JOIN groups g USING (phone_n)
  ),
  kept AS (
    SELECT * FROM ordered WHERE rk = 1
  ),
  deleted AS (
    -- on n'émet PAS dans la liste à supprimer ceux qui ont eux-mêmes
    -- du contenu critique (client_id ou opportunity active) — sécurité
    -- contre les pertes de données. Ces cas resteront visibles dans
    -- une 2ème passe manuelle si nécessaire.
    SELECT *
    FROM ordered
    WHERE rk > 1
      AND (priority_score < 100)  -- ni client_id ni opportunity active
  )
  SELECT
    k.phone_n                                       AS phone_normalized,
    (1 + (SELECT COUNT(*)::int FROM deleted d WHERE d.phone_n = k.phone_n)) AS group_size,
    k.id                                            AS kept_id,
    k.company_name                                  AS kept_company_name,
    k.call_count                                    AS kept_call_count,
    k.last_called_at                                AS kept_last_called_at,
    k.created_at                                    AS kept_created_at,
    ARRAY(SELECT d.id FROM deleted d WHERE d.phone_n = k.phone_n ORDER BY d.created_at)            AS to_delete_ids,
    ARRAY(SELECT d.company_name FROM deleted d WHERE d.phone_n = k.phone_n ORDER BY d.created_at)  AS to_delete_companies,
    ARRAY(SELECT d.call_count FROM deleted d WHERE d.phone_n = k.phone_n ORDER BY d.created_at)    AS to_delete_call_counts
  FROM kept k
  WHERE EXISTS (SELECT 1 FROM deleted d WHERE d.phone_n = k.phone_n)
  ORDER BY k.phone_n;
END;
$$;

REVOKE ALL ON FUNCTION public.find_duplicate_prospects() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_duplicate_prospects() TO authenticated;


-- ---------- EXEC : soft-delete des doublons -------------------------
CREATE OR REPLACE FUNCTION public.dedupe_prospects()
RETURNS TABLE (
  deleted_count int,
  groups_count  int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int := 0;
  v_groups  int := 0;
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'Réservé aux founders.' USING ERRCODE = '42501';
  END IF;

  WITH ranked AS (
    SELECT
      p.id,
      p.created_at,
      public.normalize_phone(p.phone) AS phone_n,
      (CASE WHEN p.client_id IS NOT NULL THEN 1000 ELSE 0 END
       + CASE WHEN EXISTS (
           SELECT 1 FROM opportunities o
            WHERE o.prospect_id = p.id AND o.deleted_at IS NULL
         ) THEN 100 ELSE 0 END
       + CASE WHEN p.call_count > 0 OR p.last_called_at IS NOT NULL THEN 10 ELSE 0 END
      ) AS priority_score
    FROM prospects p
    WHERE p.deleted_at IS NULL
      AND p.phone IS NOT NULL
      AND public.normalize_phone(p.phone) <> ''
      AND public.normalize_phone(p.phone) IS NOT NULL
  ),
  groups AS (
    SELECT phone_n FROM ranked GROUP BY phone_n HAVING COUNT(*) > 1
  ),
  ordered AS (
    SELECT
      r.*,
      ROW_NUMBER() OVER (
        PARTITION BY r.phone_n
        ORDER BY r.priority_score DESC, r.created_at ASC, r.id ASC
      ) AS rk
    FROM ranked r
    JOIN groups g USING (phone_n)
  ),
  to_delete AS (
    SELECT id, phone_n
    FROM ordered
    WHERE rk > 1
      AND priority_score < 100  -- protège ceux liés à client/opportunity
  ),
  did_delete AS (
    UPDATE prospects p
       SET deleted_at = now()
      FROM to_delete td
     WHERE p.id = td.id
       AND p.deleted_at IS NULL
    RETURNING td.phone_n
  )
  SELECT
    COUNT(*)::int,
    COUNT(DISTINCT phone_n)::int
    INTO v_deleted, v_groups
  FROM did_delete;

  RETURN QUERY SELECT v_deleted, v_groups;
END;
$$;

REVOKE ALL ON FUNCTION public.dedupe_prospects() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dedupe_prospects() TO authenticated;
