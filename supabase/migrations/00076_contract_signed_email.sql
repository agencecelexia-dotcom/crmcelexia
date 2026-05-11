-- Quand un artisan signe son contrat dans le portail (contract_signed
-- passe à true ET signed_contract_path existe), on schedule un email
-- avec le PDF signé en attachment via la pipeline email_schedule.

-- 1. Template email
INSERT INTO email_templates (slug, description, subject_template, html_template, from_name, from_email, reply_to, is_active)
VALUES (
  'portal_contract_signed',
  'Email automatique envoyé au client quand il signe son contrat dans le portail. PDF signé en attachment.',
  'Votre contrat Celexia signé · {{client_company}}',
  $html$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Contrat signé · Celexia</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
    body { margin:0 !important; padding:0 !important; width:100% !important; }
    a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
    @media only screen and (max-width: 600px) {
      .container { width:100% !important; max-width:100% !important; border-radius:0 !important; }
      .px-card { padding-left:24px !important; padding-right:24px !important; }
      .h1-mobile { font-size:24px !important; line-height:1.25 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#FAFAFA;opacity:0;">
    Votre contrat signé est en pièce jointe · Conservez-le précieusement.
  </div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="background:#FAFAFA;">
    <tr><td align="center" style="padding:48px 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="580" class="container" style="max-width:580px;background:#FFFFFF;border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
        <tr><td class="px-card" style="padding:48px 40px 8px 40px;">
          <div style="font-size:11px;font-weight:700;color:#7C3AED;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:18px;">Contrat signé</div>
          <h1 class="h1-mobile" style="margin:0;font-size:26px;font-weight:700;line-height:1.25;color:#0F172A;letter-spacing:-0.01em;">
            Merci {{client_firstname}}, votre contrat est signé.
          </h1>
        </td></tr>
        <tr><td class="px-card" style="padding:24px 40px 8px 40px;">
          <p style="margin:0 0 12px 0;font-size:15px;line-height:1.65;color:#334155;">
            Votre contrat d'apport d'affaires Celexia pour <strong style="color:#0F172A;">{{client_company}}</strong> a bien été signé électroniquement.
          </p>
          <p style="margin:0 0 12px 0;font-size:15px;line-height:1.65;color:#334155;">
            Vous trouverez le PDF signé en pièce jointe de cet email — conservez-le précieusement, il fait foi entre les Parties.
          </p>
          <p style="margin:0;font-size:15px;line-height:1.65;color:#334155;">
            Continuez votre onboarding depuis votre espace pour finaliser l'activation de vos campagnes.
          </p>
        </td></tr>
        <tr><td class="px-card" align="center" style="padding:24px 40px 32px 40px;">
          <a href="https://crmcelexia.vercel.app/portal/onboarding/welcome" style="display:inline-block;background:#7C3AED;color:#FFFFFF;font-size:15px;font-weight:600;padding:12px 22px;border-radius:10px;text-decoration:none;">
            Reprendre mon onboarding
          </a>
        </td></tr>
        <tr><td class="px-card" style="padding:0 40px 40px 40px;border-top:1px solid #F1F5F9;padding-top:24px;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#64748B;">
            Une question ? Répondez directement à cet email ou écrivez-nous à <a href="mailto:agence.celexia@gmail.com" style="color:#7C3AED;text-decoration:none;">agence.celexia@gmail.com</a>.
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


-- 2. Trigger function : crée un email_schedule quand contract_signed bascule à true
CREATE OR REPLACE FUNCTION trigger_portal_contract_signed_email()
RETURNS TRIGGER AS $$
DECLARE
  v_email text;
  v_firstname text;
  v_lastname text;
  v_company text;
  v_filename text;
BEGIN
  -- Ne fire QUE sur la transition false → true ET si on a un path PDF
  IF NEW.contract_signed = true
     AND COALESCE(OLD.contract_signed, false) = false
     AND NEW.signed_contract_path IS NOT NULL THEN

    SELECT c.contact_email, c.contact_firstname, c.contact_name, c.company_name
      INTO v_email, v_firstname, v_lastname, v_company
      FROM clients c
      WHERE c.id = NEW.client_id;

    IF v_email IS NOT NULL AND v_email <> '' THEN
      v_filename := 'Contrat-Celexia-'
        || regexp_replace(COALESCE(v_company, 'signe'), '[^a-zA-Z0-9-]', '-', 'g')
        || '.pdf';

      INSERT INTO email_schedule (
        recipient_email,
        recipient_name,
        email_type,
        scheduled_at,
        payload,
        attachments,
        status
      ) VALUES (
        v_email,
        TRIM(BOTH FROM (COALESCE(v_firstname, '') || ' ' || COALESCE(v_lastname, ''))),
        'portal_contract_signed',
        now(),
        jsonb_build_object(
          'client_firstname', COALESCE(NULLIF(v_firstname, ''), 'cher artisan'),
          'client_lastname', COALESCE(v_lastname, ''),
          'client_company', COALESCE(NULLIF(v_company, ''), 'votre entreprise')
        ),
        jsonb_build_array(
          jsonb_build_object(
            'filename', v_filename,
            'storage_bucket', 'portal-documents',
            'storage_path', NEW.signed_contract_path,
            'content_type', 'application/pdf'
          )
        ),
        'scheduled'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_portal_contract_signed_email ON portal_onboardings;
CREATE TRIGGER trg_portal_contract_signed_email
  AFTER UPDATE ON portal_onboardings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_portal_contract_signed_email();
