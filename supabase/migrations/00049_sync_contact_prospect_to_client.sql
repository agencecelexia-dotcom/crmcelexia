-- ISSUE-003 : Trigger sync contact prospects → clients
--
-- Les colonnes contact (contact_name, contact_firstname, contact_email, phone,
-- profession, city, address, website, siret, siren) sont dupliquées entre
-- les tables prospects et clients. Pas de propagation automatique : si on
-- modifie l'email côté prospect, le client lié reste avec l'ancien email
-- → désync data, reporting incohérent.
--
-- Solution : trigger AFTER UPDATE sur prospects qui propage les changements
-- vers le client lié (via clients.prospect_id FK), avec guard anti-boucle.

CREATE OR REPLACE FUNCTION sync_prospect_contact_to_client()
RETURNS TRIGGER AS $$
BEGIN
  -- Anti-boucle infinie : si le trigger sync_client → prospect existe un jour,
  -- ce guard évite la collision.
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  -- Ne rien faire si aucun changement de contact pertinent
  IF (
    OLD.contact_email IS NOT DISTINCT FROM NEW.contact_email AND
    OLD.contact_name IS NOT DISTINCT FROM NEW.contact_name AND
    OLD.contact_firstname IS NOT DISTINCT FROM NEW.contact_firstname AND
    OLD.phone IS NOT DISTINCT FROM NEW.phone AND
    OLD.profession IS NOT DISTINCT FROM NEW.profession AND
    OLD.city IS NOT DISTINCT FROM NEW.city AND
    OLD.address IS NOT DISTINCT FROM NEW.address AND
    OLD.website IS NOT DISTINCT FROM NEW.website AND
    OLD.siret IS NOT DISTINCT FROM NEW.siret AND
    OLD.siren IS NOT DISTINCT FROM NEW.siren
  ) THEN
    RETURN NEW;
  END IF;

  -- Propager vers le client lié (s'il existe et n'est pas soft-deleted)
  UPDATE clients
  SET contact_email = NEW.contact_email,
      contact_name = NEW.contact_name,
      contact_firstname = NEW.contact_firstname,
      phone = NEW.phone,
      profession = NEW.profession,
      city = NEW.city,
      address = NEW.address,
      website = NEW.website,
      siret = NEW.siret,
      siren = NEW.siren,
      updated_at = NOW()
  WHERE prospect_id = NEW.id
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_prospect_contact_to_client ON prospects;

CREATE TRIGGER trg_sync_prospect_contact_to_client
  AFTER UPDATE ON prospects
  FOR EACH ROW
  EXECUTE FUNCTION sync_prospect_contact_to_client();

COMMENT ON FUNCTION sync_prospect_contact_to_client() IS
  'ISSUE-003 : Propage les changements de contact prospects vers clients liés. Évite la désync data quand on modifie un contact côté prospect après conversion.';
