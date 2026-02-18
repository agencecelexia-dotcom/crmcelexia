const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SIRENE_API_KEY = Deno.env.get('SIRENE_API_KEY') || 'fb76cf7e-e820-461a-b6cf-7ee820d61a92'
const MAPPY_API_KEY = Deno.env.get('MAPPY_API_KEY') || 'f2wjQp1eFdTe26YcAP3K92m7d9cV8x1Z'

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
    const timeout = setTimeout(() => controller.abort(), 800)
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

    // Verify match - use words > 2 chars to avoid skipping short company names
    const townMatch =
      poi.town && ville.toLowerCase().includes(poi.town.toLowerCase())
    const nameWords = nomSociete
      .split(/\s+/)
      .filter((w: string) => w.length > 2)
    const nameMatch =
      poi.name &&
      nameWords.length > 0 &&
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

// --- Auth helper ---

function verifyAuth(req: Request): void {
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Non autorisé')
  }
  // The Supabase client always sends the user's JWT or anon key.
  // Edge functions are only callable with a valid apikey, which Supabase
  // enforces at the gateway level. This is sufficient for our use case.
}

// --- SIRENE handler ---

async function handleFetchSirene({
  codes,
  cursor,
}: {
  codes: string[]
  cursor: string
}) {
  if (!codes || codes.length === 0) throw new Error('Codes NAF requis')
  if (!cursor) cursor = '*'

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

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  let response: Response
  try {
    response = await fetch(
      `https://api.insee.fr/api-sirene/3.11/siret?${params}`,
      {
        headers: {
          'X-INSEE-Api-Key-Integration': SIRENE_API_KEY,
          Accept: 'application/json',
        },
        signal: controller.signal,
      },
    )
  } catch (err) {
    clearTimeout(timeout)
    throw new Error(`SIRENE API inaccessible: ${err instanceof Error ? err.message : 'timeout'}`)
  }
  clearTimeout(timeout)

  if (response.status === 429) {
    return { leads: [], nextCursor: cursor, total: 0, rateLimited: true }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `SIRENE API ${response.status}: ${text.slice(0, 200)}`,
    )
  }

  let data: any
  try {
    data = await response.json()
  } catch {
    throw new Error('SIRENE API: réponse JSON invalide')
  }
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

    const prenom = ul.prenomUsuelUniteLegale || ul.prenom1UniteLegale || ''
    const nom = ul.nomUniteLegale || ''
    let nom_societe =
      ul.denominationUniteLegale ||
      ul.denominationUsuelle1UniteLegale ||
      ''
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

    // DOM-TOM: department codes are 3 digits (971, 972, etc.)
    const dept = code_postal.length >= 3 && code_postal.startsWith('97')
      ? code_postal.slice(0, 3)
      : code_postal.slice(0, 2)

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
      departement: dept,
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
  if (!leads || leads.length === 0) {
    return { results: [] }
  }

  const results: EnrichResult[] = await Promise.all(
    leads.map(async (lead) => {
      try {
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
      } catch {
        // If enrichment fails for one lead, skip it instead of crashing the batch
        return {
          lead: { ...lead, telephone: '', email: '', niche, role_dirigeant: '' },
          excluded: true,
          exclusion_reason: 'enrichment_error',
        }
      }
    }),
  )

  return { results }
}

// --- Cleanup handler (service role) ---

async function handleCleanupNoPhone(): Promise<{ deleted: number }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // phone column is NOT NULL, so we only need to check for empty string
  const response = await fetch(
    `${supabaseUrl}/rest/v1/prospects?deleted_at=is.null&phone=eq.`,
    {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    },
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Cleanup failed: ${response.status} ${text.slice(0, 200)}`)
  }

  const data = await response.json()
  return { deleted: Array.isArray(data) ? data.length : 0 }
}

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    verifyAuth(req)

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({ error: 'Corps de requête JSON invalide' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const { action, ...params } = body

    let result: unknown

    switch (action) {
      case 'fetch_sirene':
        result = await handleFetchSirene(params as { codes: string[]; cursor: string })
        break
      case 'enrich_batch':
        result = await handleEnrichBatch(params as { leads: RawLead[]; niche: string })
        break
      case 'cleanup_no_phone':
        result = await handleCleanupNoPhone()
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
    console.error('Edge function error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
