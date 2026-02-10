// Prospect table column IDs
export const PROSPECT_TABLE_COLUMNS = [
  'company_name',
  'phone',
  'profession',
  'city',
  'status',
  'commercial',
  'call_count',
  'last_called_at',
  'next_reminder_at',
  'created_at',
] as const

// CSV importable fields
export const CSV_IMPORTABLE_FIELDS = [
  { key: 'company_name', label: 'Nom entreprise', required: true },
  { key: 'phone', label: 'Téléphone', required: true },
  { key: 'contact_name', label: 'Nom contact', required: false },
  { key: 'contact_firstname', label: 'Prénom contact', required: false },
  { key: 'contact_email', label: 'Email contact', required: false },
  { key: 'google_maps_url', label: 'URL Google Maps', required: false },
  { key: 'website', label: 'Site web', required: false },
  { key: 'profession', label: 'Métier / catégorie', required: false },
  { key: 'city', label: 'Ville', required: false },
  { key: 'zone', label: 'Zone', required: false },
  { key: 'address', label: 'Adresse', required: false },
  { key: 'phone_secondary', label: 'Téléphone secondaire', required: false },
  { key: 'notes', label: 'Notes', required: false },
] as const
