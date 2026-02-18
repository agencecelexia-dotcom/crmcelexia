import { supabase } from '@/lib/supabase/client'

// --- Niche categories with sub-niches ---

export interface SubNiche {
  label: string
  codes: string[]
}

export interface NicheCategory {
  label: string
  subNiches: SubNiche[]
  allCodes: string[]
}

export const NICHE_CATEGORIES: NicheCategory[] = [
  {
    label: 'Artisan Batiment',
    allCodes: [
      '43.21A', '43.21B', '43.22A', '43.22B', '43.34Z', '43.31Z',
      '43.32A', '43.32B', '43.33Z', '43.39Z', '43.91B', '43.91A',
      '43.99C', '43.29A', '43.12A', '43.12B', '43.11Z', '43.99A',
      '43.99B', '43.13Z', '43.29B',
    ],
    subNiches: [
      { label: 'Couvreur', codes: ['43.91B'] },
      { label: 'Charpentier', codes: ['43.91A'] },
      { label: 'Électricien', codes: ['43.21A', '43.21B'] },
      { label: 'Plombier', codes: ['43.22A'] },
      { label: 'Chauffagiste / Climatisation', codes: ['43.22B'] },
      { label: 'Peintre', codes: ['43.34Z'] },
      { label: 'Plaquiste / Plâtrier', codes: ['43.31Z'] },
      { label: 'Menuisier / Serrurier', codes: ['43.32A', '43.32B'] },
      { label: 'Carreleur', codes: ['43.33Z'] },
      { label: 'Maçon', codes: ['43.99C'] },
      { label: 'Isolation', codes: ['43.29A'] },
      { label: 'Terrassement', codes: ['43.12A', '43.12B'] },
      { label: 'Démolition', codes: ['43.11Z'] },
      { label: 'Étanchéité', codes: ['43.99A'] },
      { label: 'Structure métallique', codes: ['43.99B'] },
      { label: 'Forage / Sondage', codes: ['43.13Z'] },
      { label: 'Finition (autres)', codes: ['43.39Z'] },
      { label: 'Autres installations', codes: ['43.29B'] },
      { label: 'Paysagiste', codes: ['81.30Z'] },
    ],
  },
  {
    label: 'Beaute / Coiffure / Bien-etre',
    allCodes: ['96.02A', '96.02B', '96.04Z', '96.09Z'],
    subNiches: [
      { label: 'Coiffure', codes: ['96.02A'] },
      { label: 'Soins de beauté', codes: ['96.02B'] },
      { label: 'Entretien corporel', codes: ['96.04Z'] },
      { label: 'Autres soins', codes: ['96.09Z'] },
    ],
  },
]

// Flat list of all niche names for backward compat
export const AVAILABLE_NICHES = NICHE_CATEGORIES.map((c) => c.label)

export interface GenerationProgress {
  phase: 'collecting' | 'enriching' | 'done' | 'error'
  collected: number
  enriched: number
  withPhone: number
  quantity: number
  sireneExhausted: boolean
  inserted: number
  error?: string
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

interface EnrichedLead extends RawLead {
  telephone: string
  email: string
  niche: string
  role_dirigeant: string
}

interface EnrichResult {
  lead: EnrichedLead
  excluded: boolean
  exclusion_reason?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function invokeFunction(action: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(
    'generate-prospects',
    { body: { action, ...params } },
  )
  if (error) {
    let detail = error.message
    try {
      if (data && typeof data === 'object' && 'error' in data) {
        detail = (data as { error: string }).error
      }
    } catch { /* ignore */ }
    throw new Error(detail)
  }
  return data
}

/**
 * Delete (soft-delete) all prospects that have no phone number.
 */
export async function deleteProspectsWithoutPhone(): Promise<number> {
  const { data, error } = await supabase
    .from('prospects')
    .update({ deleted_at: new Date().toISOString() })
    .is('deleted_at', null)
    .or('phone.is.null,phone.eq.')
    .select('id')

  if (error) throw new Error(`Erreur suppression: ${error.message}`)
  return data?.length || 0
}

export async function generateProspects(
  nicheName: string,
  nafCodes: string[],
  quantity: number,
  commercialId: string,
  onProgress: (progress: GenerationProgress) => void,
  abortSignal?: AbortSignal,
): Promise<number> {
  const phoneLeads: EnrichedLead[] = []
  const seenSirets = new Set<string>()
  let cursor = '*'
  let sireneExhausted = false
  let totalCollected = 0
  let totalEnriched = 0

  onProgress({
    phase: 'collecting',
    collected: 0,
    enriched: 0,
    withPhone: 0,
    quantity,
    sireneExhausted: false,
    inserted: 0,
  })

  // --- Interleaved loop: fetch SIRENE page → enrich → repeat until target ---
  while (phoneLeads.length < quantity && !sireneExhausted) {
    if (abortSignal?.aborted) throw new Error('Annulé')

    // Fetch one page from SIRENE (100 results)
    const data = await invokeFunction('fetch_sirene', { codes: nafCodes, cursor })

    if (data.rateLimited) {
      await sleep(5000)
      continue
    }

    const rawLeads = data.leads as RawLead[]
    cursor = data.nextCursor

    if (!cursor || rawLeads.length === 0) {
      sireneExhausted = true
    }

    // Deduplicate
    const freshLeads = rawLeads.filter((l) => {
      if (seenSirets.has(l.siret)) return false
      seenSirets.add(l.siret)
      return true
    })

    totalCollected += freshLeads.length

    onProgress({
      phase: 'collecting',
      collected: totalCollected,
      enriched: totalEnriched,
      withPhone: phoneLeads.length,
      quantity,
      sireneExhausted,
      inserted: 0,
    })

    if (freshLeads.length === 0) continue

    // Check existing SIRETs in DB
    const siretChunk = freshLeads.map((l) => l.siret)
    const existingSirets = new Set<string>()

    for (let i = 0; i < siretChunk.length; i += 500) {
      const chunk = siretChunk.slice(i, i + 500)
      const { data: existingData } = await supabase
        .from('prospects')
        .select('siret')
        .in('siret', chunk)
        .is('deleted_at', null)
      for (const e of existingData || []) {
        existingSirets.add((e as { siret: string }).siret)
      }
    }

    const leadsToEnrich = freshLeads.filter((l) => !existingSirets.has(l.siret))

    // Enrich in batches of 10
    const batchSize = 10
    for (let j = 0; j < leadsToEnrich.length; j += batchSize) {
      if (abortSignal?.aborted) throw new Error('Annulé')
      if (phoneLeads.length >= quantity) break

      const batch = leadsToEnrich.slice(j, j + batchSize)
      const enrichData = await invokeFunction('enrich_batch', {
        leads: batch,
        niche: nicheName,
      })

      const results = enrichData.results as EnrichResult[]
      for (const r of results) {
        if (r.excluded) continue
        if (r.lead.telephone) {
          phoneLeads.push(r.lead)
        }
      }

      totalEnriched += batch.length

      onProgress({
        phase: 'enriching',
        collected: totalCollected,
        enriched: totalEnriched,
        withPhone: phoneLeads.length,
        quantity,
        sireneExhausted,
        inserted: 0,
      })

      await sleep(200)
    }

    if (!sireneExhausted) await sleep(300)
  }

  // Cap at exactly the requested quantity
  const toInsert = phoneLeads.slice(0, quantity)

  // --- Insert into DB ---
  const insertChunkSize = 50
  let inserted = 0

  for (let i = 0; i < toInsert.length; i += insertChunkSize) {
    if (abortSignal?.aborted) throw new Error('Annulé')

    const chunk = toInsert.slice(i, i + insertChunkSize)

    const records = chunk.map((lead) => ({
      company_name: lead.nom_societe,
      contact_name: lead.nom || null,
      contact_firstname: lead.prenom || null,
      contact_email: lead.email || null,
      phone: lead.telephone,
      profession: nicheName,
      city: lead.ville || null,
      address: lead.adresse
        ? `${lead.adresse}, ${lead.code_postal} ${lead.ville}`
        : null,
      status: 'nouveau' as const,
      commercial_id: commercialId,
      source: 'api_generation' as const,
      siret: lead.siret,
      siren: lead.siren,
      code_naf: lead.code_naf || null,
      niche: nicheName,
      forme_juridique: lead.forme_juridique || null,
      date_creation_entreprise: lead.date_creation || null,
      departement: lead.departement || null,
      code_postal: lead.code_postal || null,
      custom_fields: {},
    }))

    const { error } = await supabase.from('prospects').insert(records)

    if (error)
      throw new Error(`Erreur insertion: ${error.message}`)

    inserted += chunk.length
  }

  onProgress({
    phase: 'done',
    collected: totalCollected,
    enriched: totalEnriched,
    withPhone: phoneLeads.length,
    quantity,
    sireneExhausted,
    inserted,
  })

  return inserted
}
