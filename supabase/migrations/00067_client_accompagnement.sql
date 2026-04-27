-- Suivi des 5 étapes d'onboarding accompagnement client (vue côté agence Celexia,
-- séparée du portail artisan qui est self-service côté client)

CREATE TYPE accompagnement_step AS ENUM (
  'contract_signed',
  'insurance_received',
  'gmb_access_shared',
  'payment_received',
  'lsa_live'
);

CREATE TABLE IF NOT EXISTS client_accompagnement_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  step accompagnement_step NOT NULL,
  completed_at TIMESTAMPTZ,
  validated_by UUID REFERENCES profiles(id),
  notes TEXT,
  resource_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, step)
);

CREATE INDEX IF NOT EXISTS idx_accomp_client ON client_accompagnement_steps(client_id);
CREATE INDEX IF NOT EXISTS idx_accomp_pending ON client_accompagnement_steps(client_id) WHERE completed_at IS NULL;

CREATE TRIGGER accomp_updated_at
  BEFORE UPDATE ON client_accompagnement_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS : seuls fondateur + co_fondateur peuvent accéder
ALTER TABLE client_accompagnement_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accomp_founder_all" ON client_accompagnement_steps
  FOR ALL USING (is_founder()) WITH CHECK (is_founder());

-- Trigger : à la création d'un client, créer les 5 rows (une par step)
CREATE OR REPLACE FUNCTION init_client_accompagnement()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO client_accompagnement_steps (client_id, step) VALUES
    (NEW.id, 'contract_signed'),
    (NEW.id, 'insurance_received'),
    (NEW.id, 'gmb_access_shared'),
    (NEW.id, 'payment_received'),
    (NEW.id, 'lsa_live')
  ON CONFLICT (client_id, step) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_init_accompagnement ON clients;
CREATE TRIGGER trg_init_accompagnement
  AFTER INSERT ON clients
  FOR EACH ROW
  EXECUTE FUNCTION init_client_accompagnement();

-- Backfill : créer les rows pour les clients déjà existants
INSERT INTO client_accompagnement_steps (client_id, step)
SELECT c.id, s.step
FROM clients c
CROSS JOIN unnest(ARRAY['contract_signed','insurance_received','gmb_access_shared','payment_received','lsa_live']::accompagnement_step[]) AS s(step)
WHERE c.deleted_at IS NULL
ON CONFLICT (client_id, step) DO NOTHING;
