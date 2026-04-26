-- ISSUE-010 : Automatisation conversion prospect → client à opportunity.status='close'
--
-- Avant : la conversion était manuelle via convertProspectToClient (client-service.ts).
-- Si un commercial fermait une opportunity en 'close' depuis le kanban sans passer
-- par le bouton convert, le prospect était marqué converti_client (via trigger 00028)
-- mais aucun enregistrement dans clients n'était créé.
-- Conséquence : clients oubliés en DB, reporting faussé, billing impossible.
--
-- Solution : trigger AFTER UPDATE on opportunities qui crée automatiquement le client
-- s'il n'existe pas déjà, copie les infos contact depuis prospects, et set
-- prospects.client_id pour cohérence.

CREATE OR REPLACE FUNCTION auto_create_client_on_opp_close()
RETURNS TRIGGER AS $$
DECLARE
  v_prospect prospects%ROWTYPE;
  v_existing_client_id UUID;
  v_new_client_id UUID;
BEGIN
  -- Anti-boucle infinie (au cas où d'autres triggers créent des cascades)
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  -- Le client existe-t-il déjà pour ce prospect (manual conversion antérieure) ?
  SELECT id INTO v_existing_client_id
  FROM clients
  WHERE prospect_id = NEW.prospect_id AND deleted_at IS NULL
  LIMIT 1;

  IF v_existing_client_id IS NOT NULL THEN
    -- Le client existe déjà, on s'assure juste que prospects.client_id pointe vers lui
    UPDATE prospects SET client_id = v_existing_client_id WHERE id = NEW.prospect_id AND client_id IS NULL;
    RETURN NEW;
  END IF;

  -- Récupérer le prospect lié
  SELECT * INTO v_prospect FROM prospects WHERE id = NEW.prospect_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Créer le client (uniquement les colonnes qui existent dans clients)
  -- phone est NOT NULL, on prend une chaîne vide si null pour ne pas planter
  INSERT INTO clients (
    prospect_id,
    company_name,
    contact_name,
    contact_firstname,
    contact_email,
    phone,
    profession,
    city,
    address,
    website,
    commercial_id,
    source,
    converted_at,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_prospect.id,
    v_prospect.company_name,
    v_prospect.contact_name,
    v_prospect.contact_firstname,
    v_prospect.contact_email,
    COALESCE(v_prospect.phone, ''),
    v_prospect.profession,
    v_prospect.city,
    v_prospect.address,
    v_prospect.website,
    v_prospect.commercial_id,
    v_prospect.source,
    NOW(),
    'actif',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_new_client_id;

  -- Cohérence : pointer prospects.client_id vers le nouveau client
  UPDATE prospects SET client_id = v_new_client_id WHERE id = NEW.prospect_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_create_client_on_close ON opportunities;

CREATE TRIGGER trg_auto_create_client_on_close
  AFTER UPDATE ON opportunities
  FOR EACH ROW
  WHEN (NEW.status = 'close' AND OLD.status IS DISTINCT FROM 'close')
  EXECUTE FUNCTION auto_create_client_on_opp_close();

COMMENT ON FUNCTION auto_create_client_on_opp_close() IS
  'ISSUE-010 : Crée automatiquement un client quand une opportunity passe en close. ' ||
  'Idempotent : skip si le client existe déjà pour ce prospect. ' ||
  'Met à jour prospects.client_id pour la cohérence.';
