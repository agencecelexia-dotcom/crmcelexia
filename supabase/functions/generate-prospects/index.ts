const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SIRENE_API_KEY = 'fb76cf7e-e820-461a-b6cf-7ee820d61a92'
const MAPPY_API_KEY = 'f2wjQp1eFdTe26YcAP3K92m7d9cV8x1Z'

const NICHES: Record<string, string[]> = {
  'Artisan Batiment': [
    '43.21A', '43.22A', '43.22B', '43.34Z', '43.31Z',
    '43.32A', '43.32B', '43.33Z', '43.39Z', '43.91B',
    '43.99C', '43.29A', '43.12A', '43.11Z', '43.91A',
    '43.99A', '43.99B', '43.12B', '43.13Z', '43.21B',
    '43.29B',
  ],
  'Beaute / Coiffure / Bien-etre': [
    '96.02A', '96.02B', '96.04Z', '96.09Z',
  ],
}

interface RawLead {
  prenom: string
  nom: string
  nom_societe: string
  code_naf: string
  date_creation: string
  forme_juridique: string
  siret: string
  siren: string
  adresse: string
  code_postal: string
  ville: string
  departement: string
}

interface EnrichResult {
  lead: RawLead & {
    telephone: string
    email: string
    niche: string
    role_dirigeant: string
  }
  excluded: boolean
  exclusion_reason?: string
}

// --- Accent/special char removal ---

function cleanCompanyName(name: string): string {
  let cleaned = name.toLowerCase()
  const accents: Record<string, string> = {
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'à': 'a', 'â': 'a', 'ä': 'a',
    'ô': 'o', 'ö': 'o',
    'ù': 'u', 'û': 'u', 'ü': 'u',
    'î': 'i', 'ï': 'i',
    'ç': 'c',
  }
  for (const [accent, replacement] of Object.entries(accents)) {
    cleaned = cleaned.replaceAll(accent, replacement)
  }
  cleaned = cleaned.replace(/[\s'\-&.+/()]/g, '')
  return cleaned
}

// --- DNS / Domain check ---

async function domainExists(domain: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 500)
    await fetch(`http://${domain}`, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'manual',
    })
    clearTimeout(timeout)
    return true
  } catch {
    return false
  }
}

async function hasWebsite(companyName: string): Promise<boolean> {
  const cleaned = cleanCompanyName(companyName)
  if (!cleaned || cleaned.length < 2) return false
  const [fr, com] = await Promise.all([
    domainExists(`${cleaned}.fr`),
    domainExists(`${cleaned}.com`),
  ])
  return fr || com
}

// --- Mappy enrichment ---

async function enrichMappy(
  nomSociete: string,
  ville: string,
): Promise<{ telephone: string; email: string; website: string; excluded: boolean }> {
  const result = { telephone: '', email: '', website: '', excluded: false }

  try {
    const params = new URLSearchParams({
      q: `${nomSociete} ${ville}`,
      max_results: '3',
      favorite_country: '250',
      language: 'fr',
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(
      `https://api-search.mappy.net/search/1.1/find?${params}`,
      {
        headers: {
          apikey: MAPPY_API_KEY,
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
          Origin: 'https://fr.mappy.com',
          Referer: 'https://fr.mappy.com/',
        },
        signal: controller.signal,
      },
    )
    clearTimeout(timeout)

    if (!response.ok) return result

    const data = await response.json()
    const pois = data.pois || []
    if (pois.length === 0) return result

    const poi = pois[0]

    // Verify match
    const townMatch =
      poi.town && ville.toLowerCase().includes(poi.town.toLowerCase())
    const nameWords = nomSociete
      .split(/\s+/)
      .filter((w: string) => w.length > 3)
    const nameMatch =
      poi.name &&
      nameWords.some((w: string) =>
        poi.name.toLowerCase().includes(w.toLowerCase()),
      )

    if (!townMatch && !nameMatch) return result

    // Check website
    const siteUrl =
      poi.communication?.website || poi.website || ''
    if (siteUrl && siteUrl.length > 10) {
      result.excluded = true
      result.website = siteUrl
      return result
    }

    // Phone (RGPD check)
    const phoneData = poi.communication?.phone
    if (phoneData) {
      if (!phoneData.againstDirectMarketing && phoneData.number) {
        result.telephone = phoneData.number
      }
    }

    // Email
    result.email =
      poi.communication?.email || poi.mail || ''
  } catch {
    // Timeout or network error — skip
  }

  return result
}

// --- Annuaire Entreprises enrichment ---

async function enrichAnnuaire(
  siren: string,
): Promise<{ prenom: string; nom: string; role: string }> {
  const result = { prenom: '', nom: '', role: '' }

  try {
    const params = new URLSearchParams({
      q: siren,
      mtm_campaign: 'lead-enrichment',
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(
      `https://recherche-entreprises.api.gouv.fr/search?${params}`,
      { signal: controller.signal },
    )
    clearTimeout(timeout)

    if (!response.ok) return result

    const data = await response.json()
    const results = data.results || []
    if (results.length === 0) return result

    const dirigeants = results[0].dirigeants || []
    if (dirigeants.length === 0) return result

    const dir = dirigeants[0]
    result.prenom = dir.prenoms || ''
    result.nom = dir.nom || ''
    result.role = dir.qualite || ''
  } catch {
    // Timeout or network error — skip
  }

  return result
}

// --- SIRENE handler ---

async function handleFetchSirene({
  niche,
  codes: passedCodes,
  cursor,
}: {
  niche?: string
  codes?: string[]
  cursor: string
}) {
  const codes = passedCodes || (niche ? NICHES[niche] : null)
  if (!codes || codes.length === 0) throw new Error('Niche ou codes NAF requis')

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const dateStr = sixMonthsAgo.toISOString().slice(0, 10)

  const nafCondition = codes
    .map((code) => `activitePrincipaleUniteLegale:"${code}"`)
    .join(' OR ')

  const q = `(${nafCondition}) AND dateCreationUniteLegale:[${dateStr} TO *] AND etablissementSiege:true AND etatAdministratifUniteLegale:A AND statutDiffusionUniteLegale:O`

  const params = new URLSearchParams({
    q,
    nombre: '100',
    curseur: cursor,
  })

  const response = await fetch(
    `https://api.insee.fr/api-sirene/3.11/siret?${params}`,
    {
      headers: {
        'X-INSEE-Api-Key-Integration': SIRENE_API_KEY,
        Accept: 'application/json',
      },
    },
  )

  if (response.status === 429) {
    return { leads: [], nextCursor: cursor, total: 0, rateLimited: true }
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `SIRENE API ${response.status}: ${text.slice(0, 200)}`,
    )
  }

  const data = await response.json()
  const etablissements = data.etablissements || []
  const nextCursor = data.header?.curseurSuivant || null
  const total = data.header?.total || 0

  const leads: RawLead[] = []
  const seenSirets = new Set<string>()

  for (const etab of etablissements) {
    const ul = etab.uniteLegale || {}
    const addr = etab.adresseEtablissement || {}

    const siret = etab.siret || ''
    if (!siret || seenSirets.has(siret)) continue
    seenSirets.add(siret)

    // v3.11: denomination is directly on uniteLegale, not in periodesUniteLegale
    const prenom = ul.prenomUsuelUniteLegale || ul.prenom1UniteLegale || ''
    const nom = ul.nomUniteLegale || ''
    let nom_societe =
      ul.denominationUniteLegale ||
      ul.denominationUsuelle1UniteLegale ||
      ''
    // For individual entrepreneurs, build name from prenom + nom
    if (!nom_societe || nom_societe === '[ND]') {
      nom_societe = [prenom, nom].filter(Boolean).join(' ')
    }
    if (!nom_societe) continue

    const ville = addr.libelleCommuneEtablissement || ''
    if (!ville) continue

    const code_postal = addr.codePostalEtablissement || ''
    const numero = addr.numeroVoieEtablissement || ''
    const type_voie = addr.typeVoieEtablissement || ''
    const libelle_voie = addr.libelleVoieEtablissement || ''
    const adresse = [numero, type_voie, libelle_voie]
      .filter(Boolean)
      .join(' ')

    leads.push({
      prenom,
      nom,
      nom_societe,
      code_naf: ul.activitePrincipaleUniteLegale || '',
      date_creation: ul.dateCreationUniteLegale || '',
      forme_juridique: ul.categorieJuridiqueUniteLegale || '',
      siret,
      siren: siret.slice(0, 9),
      adresse,
      code_postal,
      ville,
      departement: code_postal.slice(0, 2),
    })
  }

  return { leads, nextCursor, total, rateLimited: false }
}

// --- Enrich batch handler ---

async function handleEnrichBatch({
  leads,
  niche,
}: {
  leads: RawLead[]
  niche: string
}) {
  const results: EnrichResult[] = await Promise.all(
    leads.map(async (lead) => {
      // Step 1: DNS check
      const hasSite = await hasWebsite(lead.nom_societe)
      if (hasSite) {
        return {
          lead: { ...lead, telephone: '', email: '', niche, role_dirigeant: '' },
          excluded: true,
          exclusion_reason: 'website_dns',
        }
      }

      // Step 2: Mappy + Annuaire in parallel
      const [mappy, annuaire] = await Promise.all([
        enrichMappy(lead.nom_societe, lead.ville),
        enrichAnnuaire(lead.siren),
      ])

      // If Mappy found a website, exclude
      if (mappy.excluded) {
        return {
          lead: { ...lead, telephone: '', email: '', niche, role_dirigeant: '' },
          excluded: true,
          exclusion_reason: 'website_mappy',
        }
      }

      // Fill in dirigeant from Annuaire only if SIRENE data is empty
      const prenom = lead.prenom || annuaire.prenom
      const nom = lead.nom || annuaire.nom

      return {
        lead: {
          ...lead,
          prenom,
          nom,
          telephone: mappy.telephone,
          email: mappy.email,
          niche,
          role_dirigeant: annuaire.role,
        },
        excluded: false,
      }
    }),
  )

  return { results }
}

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { action, ...params } = body

    let result: unknown

    switch (action) {
      case 'fetch_sirene':
        result = await handleFetchSirene(params as { niche?: string; codes?: string[]; cursor: string })
        break
      case 'enrich_batch':
        result = await handleEnrichBatch(params as { leads: RawLead[]; niche: string })
        break
      case 'get_niches':
        result = { niches: Object.keys(NICHES) }
        break
      default:
        return new Response(
          JSON.stringify({ error: `Action inconnue: ${action}` }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
