-- Système de relance automatique pour les leads stagnants
--
-- Quand l'artisan reçoit un lead de Celexia (source='lsa') mais ne fait rien
-- (statut bloqué en 'nouveau'/'qualifie'/'devis' trop longtemps), un email
-- de relance lui est envoyé pour qu'il agisse.
--
-- Cadence (par statut, en jours d'inactivité depuis updated_at) :
--   nouveau   : 2 jours → 1re relance, puis tous les 3 jours
--   qualifie  : 5 jours → 1re relance, puis tous les 5 jours
--   devis     : 10 jours → 1re relance, puis tous les 7 jours
--
-- Les statuts terminaux (signe, perdu) ne déclenchent pas de relance.
-- Les leads BAO (créés par l'artisan) ne sont pas relancés non plus.


-- ════════════════════════════════════════════════════════════════════
-- 1. Ajout du nouveau email_type au CHECK constraint
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE email_schedule DROP CONSTRAINT IF EXISTS email_schedule_email_type_check;

ALTER TABLE email_schedule ADD CONSTRAINT email_schedule_email_type_check CHECK (
  email_type = ANY (ARRAY[
    'rdv_confirmation'::text, 'rdv_confirmation_reminder'::text,
    'rdv_trust_builder'::text, 'rdv_tomorrow'::text,
    'rdv_cancelled'::text, 'rdv_rescheduled'::text,
    'rdv_followup_positive'::text, 'rdv_noshow'::text,
    'client_welcome'::text, 'portal_invitation'::text,
    'portal_onboarding_validated'::text, 'portal_onboarding_corrections'::text,
    'portal_onboarding_reminder'::text, 'portal_contract_signed'::text,
    'portal_lead_stale_reminder'::text,
    'client_first_signed_quote'::text,
    'internal_devis_signed'::text, 'internal_rdv_unconfirmed'::text,
    'internal_rdv_confirmed'::text, 'internal_rdv_cancelled'::text,
    'internal_payment_received'::text, 'internal_lead_hot'::text,
    'payment_received'::text, 'invoice_monthly'::text,
    'lead_hot_alert'::text, 'admin_alert'::text
  ])
);


-- ════════════════════════════════════════════════════════════════════
-- 2. Template email "relance lead stagnant"
-- ════════════════════════════════════════════════════════════════════

INSERT INTO email_templates (slug, description, subject_template, html_template, from_name, from_email, reply_to, is_active)
VALUES (
  'portal_lead_stale_reminder',
  'Email automatique envoyé à l''artisan quand un lead Celexia stagne trop longtemps sans changement de statut.',
  '⏰ Action requise — lead {{lead_name}} en attente depuis {{lead_age_days}} jours',
  $html$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Lead en attente · Celexia</title>
  <style>
    @media only screen and (max-width: 600px) {
      .container { width:100% !important; max-width:100% !important; border-radius:0 !important; }
      .px-card { padding-left:24px !important; padding-right:24px !important; }
      .h1-mobile { font-size:22px !important; line-height:1.25 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="background:#FAFAFA;">
    <tr><td align="center" style="padding:48px 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="580" class="container" style="max-width:580px;background:#FFFFFF;border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
        <tr><td class="px-card" style="padding:48px 40px 8px 40px;">
          <div style="font-size:11px;font-weight:700;color:#D97706;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:18px;">
            ⏰ Action requise
          </div>
          <h1 class="h1-mobile" style="margin:0;font-size:26px;font-weight:700;line-height:1.25;color:#0F172A;letter-spacing:-0.01em;">
            {{client_firstname}}, un lead vous attend.
          </h1>
        </td></tr>
        <tr><td class="px-card" style="padding:24px 40px 8px 40px;">
          <p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#334155;">
            Un prospect que Celexia vous a transmis est en attente depuis <strong style="color:#0F172A;">{{lead_age_days}} jours</strong>. Plus vous tardez, plus vous risquez de le perdre.
          </p>
          <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:10px;padding:16px;margin-bottom:14px;">
            <div style="font-size:13px;font-weight:700;color:#92400E;margin-bottom:6px;">
              {{lead_name}}
            </div>
            <div style="font-size:13px;color:#78350F;line-height:1.55;">
              📞 {{lead_phone}}<br/>
              🔧 {{lead_work_type}}<br/>
              📍 {{lead_city}}
            </div>
          </div>
          <p style="margin:0;font-size:14px;line-height:1.65;color:#334155;">
            <strong style="color:#0F172A;">Appelez ce prospect dès aujourd'hui</strong> et mettez à jour son statut depuis votre portail.
          </p>
        </td></tr>
        <tr><td class="px-card" align="center" style="padding:24px 40px 32px 40px;">
          <a href="{{portal_url}}" style="display:inline-block;background:#7C3AED;color:#FFFFFF;font-size:15px;font-weight:600;padding:14px 24px;border-radius:10px;text-decoration:none;">
            Ouvrir mon portail
          </a>
        </td></tr>
        <tr><td class="px-card" style="padding:0 40px 40px 40px;border-top:1px solid #F1F5F9;padding-top:24px;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#64748B;">
            Vous recevez cette relance car ce lead n'a pas bougé depuis {{lead_age_days}} jours. Mettre à jour son statut (qualifié, devis envoyé, signé, perdu) suspend automatiquement les relances.
          </p>
        </td></tr>
      </table>
      <div style="margin-top:24px;font-size:11px;color:#94A3B8;text-align:center;">CELEXIA SASU · SIREN 939 306 429</div>
    </td></tr>
  </table>
</body>
</html>$html$,
  'Celexia',
  'antoine@celexia-pro.fr',
  'agence.celexia@gmail.com',
  true
)
ON CONFLICT (slug) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  html_template = EXCLUDED.html_template,
  description = EXCLUDED.description,
  is_active = true,
  updated_at = now();


-- ════════════════════════════════════════════════════════════════════
-- 3. Fonction de scan : trouve les leads stagnants et schedule un reminder
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION schedule_stale_lead_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_lead record;
  v_client record;
  v_threshold_days integer;
  v_age_days integer;
  v_last_reminder timestamptz;
  v_cooldown_days integer;
BEGIN
  -- Pour chaque lead LSA actif (non terminal, non supprimé)
  FOR v_lead IN
    SELECT pl.*
    FROM portal_leads pl
    WHERE pl.source = 'lsa'
      AND pl.deleted_at IS NULL
      AND pl.status IN ('nouveau', 'qualifie', 'devis')
  LOOP
    -- Seuil par statut + cooldown entre relances
    CASE v_lead.status
      WHEN 'nouveau' THEN v_threshold_days := 2; v_cooldown_days := 3;
      WHEN 'qualifie' THEN v_threshold_days := 5; v_cooldown_days := 5;
      WHEN 'devis' THEN v_threshold_days := 10; v_cooldown_days := 7;
      ELSE CONTINUE;
    END CASE;

    v_age_days := EXTRACT(DAY FROM (now() - v_lead.updated_at))::integer;

    -- Pas assez vieux : skip
    IF v_age_days < v_threshold_days THEN
      CONTINUE;
    END IF;

    -- Cooldown : déjà reminded récemment ?
    SELECT MAX(scheduled_at) INTO v_last_reminder
    FROM email_schedule
    WHERE email_type = 'portal_lead_stale_reminder'
      AND (payload->>'lead_id')::uuid = v_lead.id;

    IF v_last_reminder IS NOT NULL
       AND v_last_reminder > now() - (v_cooldown_days || ' days')::interval
    THEN
      CONTINUE;
    END IF;

    -- Fetch client info
    SELECT c.contact_email, c.contact_firstname, c.contact_name, c.company_name
    INTO v_client
    FROM clients c
    WHERE c.id = v_lead.client_id;

    IF v_client.contact_email IS NULL OR v_client.contact_email = '' THEN
      CONTINUE;
    END IF;

    -- Insère l'email programmé (la pipeline send-scheduled-emails le délivrera
    -- en respectant les heures ouvrées)
    INSERT INTO email_schedule (
      recipient_email,
      recipient_name,
      email_type,
      scheduled_at,
      payload,
      status
    ) VALUES (
      v_client.contact_email,
      COALESCE(
        NULLIF(TRIM(BOTH FROM (COALESCE(v_client.contact_firstname, '') || ' ' || COALESCE(v_client.contact_name, ''))), ''),
        NULLIF(v_client.company_name, ''),
        'Artisan Celexia'
      ),
      'portal_lead_stale_reminder',
      now(),
      jsonb_build_object(
        'lead_id', v_lead.id,
        'lead_name', v_lead.name,
        'lead_phone', v_lead.phone,
        'lead_work_type', v_lead.work_type,
        'lead_city', COALESCE(v_lead.city, '—'),
        'lead_status', v_lead.status,
        'lead_age_days', v_age_days,
        'client_firstname', COALESCE(NULLIF(v_client.contact_firstname, ''), 'cher artisan'),
        'client_company', COALESCE(NULLIF(v_client.company_name, ''), ''),
        'portal_url', 'https://crmcelexia.vercel.app/portal/leads/' || v_lead.id
      ),
      'scheduled'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION schedule_stale_lead_reminders() IS 'Scanne les leads LSA stagnants et insère un email de relance dans email_schedule. À appeler périodiquement (cron). Retourne le nombre d''emails programmés.';
