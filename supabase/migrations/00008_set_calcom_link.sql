-- Met à jour le lien Cal.com pour tous les utilisateurs (paramètre entreprise)
UPDATE company_settings
SET calcom_link = 'https://cal.com/agence-celexia-1qyn93/presentation-site-web-agence-celexia?overlayCalendar=true',
    updated_at = now();
