-- Ajoute 'portal_contract_signed' à l'enum des email_type autorisés.
-- Le trigger trg_portal_contract_signed_email (00076) inséré dans email_schedule
-- échouait sur CHECK email_schedule_email_type_check car la valeur manquait.

ALTER TABLE email_schedule DROP CONSTRAINT IF EXISTS email_schedule_email_type_check;

ALTER TABLE email_schedule ADD CONSTRAINT email_schedule_email_type_check CHECK (
  email_type = ANY (ARRAY[
    'rdv_confirmation'::text,
    'rdv_confirmation_reminder'::text,
    'rdv_trust_builder'::text,
    'rdv_tomorrow'::text,
    'rdv_cancelled'::text,
    'rdv_rescheduled'::text,
    'rdv_followup_positive'::text,
    'rdv_noshow'::text,
    'client_welcome'::text,
    'portal_invitation'::text,
    'portal_onboarding_validated'::text,
    'portal_onboarding_corrections'::text,
    'portal_onboarding_reminder'::text,
    'portal_contract_signed'::text,
    'client_first_signed_quote'::text,
    'internal_devis_signed'::text,
    'internal_rdv_unconfirmed'::text,
    'internal_rdv_confirmed'::text,
    'internal_rdv_cancelled'::text,
    'internal_payment_received'::text,
    'internal_lead_hot'::text,
    'payment_received'::text,
    'invoice_monthly'::text,
    'lead_hot_alert'::text,
    'admin_alert'::text
  ])
);
