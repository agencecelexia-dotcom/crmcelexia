-- Nettoie le calcom_link : supprime les chevrons et les https:// en double
UPDATE company_settings
SET calcom_link = regexp_replace(
      regexp_replace(calcom_link, '^<+|>+$', '', 'g'),
      '^https?://\s*<??\s*https?://', 'https://'
    ),
    updated_at = now()
WHERE calcom_link IS NOT NULL AND calcom_link != '';
