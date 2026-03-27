/**
 * Search French company registry (API Recherche Entreprises - data.gouv.fr)
 * Free, no API key needed, rate-limited to ~7 req/s
 */

export interface CompanySearchResult {
  siren: string
  siret: string
  nom_complet: string
  nom_commercial: string | null
  nature_juridique: string
  nature_juridique_label: string
  adresse: string
  code_postal: string
  ville: string
  complement_adresse: string | null
  numero_voie: string | null
  type_voie: string | null
  libelle_voie: string | null
  activite_principale: string
  activite_label: string
  dirigeant_nom: string | null
  dirigeant_prenom: string | null
  dirigeant_qualite: string | null
  date_creation: string | null
}

// Map nature_juridique codes to readable labels
const NATURE_JURIDIQUE_MAP: Record<string, string> = {
  '1000': 'Entrepreneur individuel',
  '5498': 'SASU',
  '5499': 'SAS',
  '5710': 'SARL',
  '5720': 'SARL unipersonnelle (EURL)',
  '5610': 'SA à conseil d\'administration',
  '5699': 'SA',
  '5306': 'SCI',
  '6599': 'GIE',
  '9220': 'Association déclarée',
  '5202': 'Société en nom collectif',
}

export async function searchCompany(query: string): Promise<CompanySearchResult[]> {
  const encoded = encodeURIComponent(query)
  const res = await fetch(
    `https://recherche-entreprises.api.gouv.fr/search?q=${encoded}&page=1&per_page=5&mtm_campaign=crm-celexia`,
  )
  if (!res.ok) throw new Error(`API error: ${res.status}`)

  const data = await res.json()
  const results = data.results || []

  return results.map((r: Record<string, unknown>): CompanySearchResult => {
    const siege = r.siege as Record<string, unknown> || {}
    const dirigeants = (r.dirigeants as Array<Record<string, string>>) || []
    const dir = dirigeants[0] || {}
    const natJur = String(r.nature_juridique || '')

    return {
      siren: String(r.siren || ''),
      siret: String(siege.siret || ''),
      nom_complet: String(r.nom_complet || ''),
      nom_commercial: (siege.nom_commercial as string) || null,
      nature_juridique: natJur,
      nature_juridique_label: NATURE_JURIDIQUE_MAP[natJur] || `Code ${natJur}`,
      adresse: String(siege.geo_adresse || siege.adresse || ''),
      code_postal: String(siege.code_postal || ''),
      ville: String(siege.libelle_commune || ''),
      complement_adresse: (siege.complement_adresse as string) || null,
      numero_voie: (siege.numero_voie as string) || null,
      type_voie: (siege.type_voie as string) || null,
      libelle_voie: (siege.libelle_voie as string) || null,
      activite_principale: String(siege.activite_principale || ''),
      activite_label: String(r.activite_principale || siege.activite_principale || ''),
      dirigeant_nom: dir.nom || null,
      dirigeant_prenom: dir.prenoms || null,
      dirigeant_qualite: dir.qualite || null,
      date_creation: (siege.date_creation as string) || null,
    }
  })
}

/**
 * Try multiple search strategies to find the company:
 * 1. Company name
 * 2. Contact name + city
 * 3. Phone (won't work with this API but kept for future)
 */
export async function autoSearchCompany(prospect: {
  company_name: string
  contact_name?: string | null
  contact_firstname?: string | null
  city?: string | null
  phone?: string | null
}): Promise<CompanySearchResult[]> {
  // Strategy 1: company name
  let results = await searchCompany(prospect.company_name)
  if (results.length > 0) return results

  // Strategy 2: contact full name
  const fullName = [prospect.contact_firstname, prospect.contact_name].filter(Boolean).join(' ')
  if (fullName.trim()) {
    results = await searchCompany(fullName)
    if (results.length > 0) return results
  }

  // Strategy 3: company name + city
  if (prospect.city) {
    results = await searchCompany(`${prospect.company_name} ${prospect.city}`)
    if (results.length > 0) return results
  }

  return []
}
