-- Stocke les templates HTML en DB pour que l'edge function les charge sans redéploiement
-- À chaque update du HTML, INSERT/UPDATE dans cette table.

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  subject_template TEXT NOT NULL,
  html_template TEXT NOT NULL,
  from_name TEXT NOT NULL DEFAULT 'Antoine Celexia',
  from_email TEXT NOT NULL DEFAULT 'antoine@celexia-pro.fr',
  reply_to TEXT NOT NULL DEFAULT 'antoine@celexia-pro.fr',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_templates_admin_all ON email_templates
  FOR ALL TO authenticated
  USING (public.is_founder());

-- Note : les templates HTML sont seedés via le script scripts/seed-email-templates.mjs
-- (trop gros pour les inclure inline dans la migration, contenu = 12KB+ par template)

COMMENT ON TABLE email_templates IS
  'Templates HTML email (séquence pré-RDV, validations, alertes). Variables au format {{var_name}} remplacees par le sender.';
