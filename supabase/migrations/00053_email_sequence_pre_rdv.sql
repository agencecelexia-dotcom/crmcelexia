-- Système d'email automation pré-RDV (séquence Cal.com → R1)
-- Trigger : Cal.com webhook BOOKING_CREATED
-- Schedule : 3 emails (Confirmation H+15min, CaseStudy J-2, Recap J-1)

-- 1. Ajout cal_booking_id sur rendez_vous pour tracker
ALTER TABLE rendez_vous
  ADD COLUMN IF NOT EXISTS cal_booking_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_rendez_vous_cal_booking_id
  ON rendez_vous(cal_booking_id)
  WHERE cal_booking_id IS NOT NULL AND deleted_at IS NULL;

-- 2. Table case_studies (cas client par secteur, pour Email 2)
CREATE TABLE IF NOT EXISTS case_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector TEXT NOT NULL CHECK (sector IN ('paysagiste','pisciniste','plombier','couvreur','electricien','macon','menuisier','demenageur','autre')),
  artisan_name TEXT NOT NULL,
  artisan_company TEXT,
  artisan_city TEXT,
  story_short TEXT NOT NULL,
  metric_devis_count INT NOT NULL,
  metric_period_months INT NOT NULL DEFAULT 1,
  metric_revenue_eur INT,
  visual_url TEXT,
  testimonial_quote TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_studies_sector_active
  ON case_studies(sector)
  WHERE is_active = true;

ALTER TABLE case_studies ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_studies_admin_all ON case_studies
  FOR ALL TO authenticated
  USING (public.is_founder());

-- 3. Table email_schedule (planification d'envoi)
CREATE TABLE IF NOT EXISTS email_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rdv_id UUID REFERENCES rendez_vous(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  email_type TEXT NOT NULL CHECK (email_type IN (
    'rdv_confirmation','rdv_case_study','rdv_recap_j1',
    'rdv_cancellation','rdv_reschedule',
    'client_welcome','payment_received','onboarding_reminder',
    'lead_hot_alert','admin_alert'
  )),
  payload JSONB NOT NULL DEFAULT '{}',
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','sent','failed','cancelled','skipped')),
  resend_id TEXT,
  error_message TEXT,
  attempt_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_schedule_due
  ON email_schedule(scheduled_at)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_email_schedule_rdv
  ON email_schedule(rdv_id)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_email_schedule_prospect
  ON email_schedule(prospect_id);

CREATE TRIGGER email_schedule_updated_at
  BEFORE UPDATE ON email_schedule
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE email_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_schedule_admin_all ON email_schedule
  FOR ALL TO authenticated
  USING (public.is_founder());

-- 4. Seed initial : 1 case study par secteur (placeholder, à enrichir avec les vrais)
INSERT INTO case_studies (sector, artisan_name, artisan_company, artisan_city, story_short, metric_devis_count, metric_period_months, metric_revenue_eur, testimonial_quote)
VALUES
  ('paysagiste', 'Pierre L.', 'Jardins du Sud', 'Aix-en-Provence',
   'Pierre faisait 3 devis par mois en moyenne, avec un pic à 7 en juillet. En 4 mois avec Celexia : 38 devis signés, dont 12 sur la zone premium qu''il visait depuis 2 ans.',
   38, 4, 124000,
   'Avant Celexia je passais 3h par jour sur les pubs Facebook sans résultat. Maintenant je signe les devis, point.'),

  ('pisciniste', 'Marc D.', 'Piscines Méditerranée', 'Marseille',
   'Marc dépensait 800€/mois en pub Google sans tracking précis. En 6 mois avec Celexia : 24 devis signés, ROI mesurable, et il a embauché un 2e poseur.',
   24, 6, 198000,
   'Le modèle commission a tout changé. Aucun risque, juste des leads qualifiés.'),

  ('plombier', 'Karim B.', 'Plomberie Express 75', 'Paris',
   'Karim cherchait des chantiers de rénovation sdb (gros panier moyen). En 3 mois avec Celexia : 19 devis signés sur ce segment précis, panier moyen 6500€.',
   19, 3, 123500,
   'Ils ciblent exactement mon créneau. Plus besoin de courir après les fuites à 50€.'),

  ('couvreur', 'Stéphane M.', 'Couverture Bretagne', 'Rennes',
   'Stéphane subissait la saisonnalité (hiver creux). Avec Celexia : 15 devis signés sur 4 mois d''hiver, dont 8 isolations toiture (forte prime CEE).',
   15, 4, 87000,
   'L''hiver dernier j''ai fait mon meilleur trimestre depuis 5 ans grâce aux leads Celexia.'),

  ('electricien', 'Antoine R.', 'Électricité Pro IDF', 'Versailles',
   'Antoine voulait sortir du dépannage et viser la rénovation complète. En 5 mois avec Celexia : 22 devis signés rénovation maison, panier moyen 8200€.',
   22, 5, 180400,
   'Avant je faisais que du dépannage. Maintenant 70% de mon CA c''est de la rénovation grâce à eux.'),

  ('macon', 'Olivier T.', 'Maçonnerie Tradition 33', 'Bordeaux',
   'Olivier ne savait pas comment se positionner online. En 6 mois avec Celexia : 28 devis signés, dont 10 extensions maison à 25k€+.',
   28, 6, 312000,
   'Ma fiche Google passe au-dessus des pages jaunes maintenant. Je n''ai plus besoin de prospecter.'),

  ('autre', 'Julien C.', 'Artisan Polyvalent', 'Lyon',
   'Julien combinait plusieurs métiers du bâtiment. Celexia a ciblé son cœur de métier (rénovation) : 17 devis signés en 4 mois, panier moyen 7800€.',
   17, 4, 132600,
   'Le ciblage fait toute la différence. Avant je récupérais des demandes que je ne pouvais pas honorer.')
ON CONFLICT DO NOTHING;
