import { supabase } from '@/lib/supabase/client'

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

export const AVAILABLE_NICHES = Object.keys(NICHES)

export interface GenerationProgress {
  phase: 'collecting' | 'enriching' | 'done' | 'error'
  collected: number
  collectTotal: number
  enriched: number
  enrichTotal: number
  withPhone: number
  withoutPhone: number
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

export async function generateProspects(
  niche: string,
  quantity: number,
  commercialId: string,
  onProgress: (progress: GenerationProgress) => void,
  abortSignal?: AbortSignal,
): Promise<number> {
  const targetRaw = quantity * 3
  const rawLeads: RawLead[] = []
  let cursor = '*'
  let sireneTotal = 0

  // --- Phase 1: Collect from SIRENE ---
  onProgress({
    phase: 'collecting',
    collected: 0,
    collectTotal: targetRaw,
    enriched: 0,
    enrichTotal: 0,
    withPhone: 0,
    withoutPhone: 0,
    inserted: 0,
  })

  while (rawLeads.length < targetRaw) {
    if (abortSignal?.aborted) throw new Error('Annulé')

    const { data, error } = await supabase.functions.invoke(
      'generate-prospects',
      { body: { action: 'fetch_sirene', niche, cursor } },
    )

    if (error) throw new Error(`Erreur SIRENE: ${error.message}`)
    if (data.rateLimited) {
      await sleep(5000)
      continue
    }

    const leads = data.leads as RawLead[]
    rawLeads.push(...leads)
    cursor = data.nextCursor
    sireneTotal = data.total

    onProgress({
      phase: 'collecting',
      collected: rawLeads.length,
      collectTotal: Math.min(targetRaw, sireneTotal || targetRaw),
      enriched: 0,
      enrichTotal: 0,
      withPhone: 0,
      withoutPhone: 0,
      inserted: 0,
    })

    if (!cursor) break
    await sleep(300)
  }

  // Deduplicate by SIRET
  const seenSirets = new Set<string>()
  const uniqueLeads = rawLeads.filter((lead) => {
    if (seenSirets.has(lead.siret)) return false
    seenSirets.add(lead.siret)
    return true
  })

  // Check existing SIRETs in DB
  const siretList = uniqueLeads.map((l) => l.siret)
  const { data: existingData } = await supabase
    .from('prospects')
    .select('siret')
    .in('siret', siretList)
    .is('deleted_at', null)

  const existingSirets = new Set(
    (existingData || []).map((e: { siret: string }) => e.siret),
  )
  const newLeads = uniqueLeads.filter(
    (l) => !existingSirets.has(l.siret),
  )

  // --- Phase 2: Enrich in batches ---
  const enrichedLeads: EnrichedLead[] = []
  let withPhone = 0
  let withoutPhone = 0
  const batchSize = 10

  for (let i = 0; i < newLeads.length; i += batchSize) {
    if (abortSignal?.aborted) throw new Error('Annulé')

    const batch = newLeads.slice(i, i + batchSize)

    const { data, error } = await supabase.functions.invoke(
      'generate-prospects',
      { body: { action: 'enrich_batch', leads: batch, niche } },
    )

    if (error)
      throw new Error(`Erreur enrichissement: ${error.message}`)

    const results = data.results as EnrichResult[]
    for (const r of results) {
      if (r.excluded) continue
      enrichedLeads.push(r.lead)
      if (r.lead.telephone) withPhone++
      else withoutPhone++
    }

    onProgress({
      phase: 'enriching',
      collected: newLeads.length,
      collectTotal: newLeads.length,
      enriched: Math.min(i + batchSize, newLeads.length),
      enrichTotal: newLeads.length,
      withPhone,
      withoutPhone,
      inserted: 0,
    })

    await sleep(200)
  }

  // Sort: with phone first
  const sorted = [
    ...enrichedLeads.filter((l) => l.telephone),
    ...enrichedLeads.filter((l) => !l.telephone),
  ]

  // --- Phase 3: Insert into DB ---
  const insertChunkSize = 50
  let inserted = 0

  for (let i = 0; i < sorted.length; i += insertChunkSize) {
    if (abortSignal?.aborted) throw new Error('Annulé')

    const chunk = sorted.slice(i, i + insertChunkSize)

    const records = chunk.map((lead) => ({
      company_name: lead.nom_societe,
      contact_name: lead.nom || null,
      contact_firstname: lead.prenom || null,
      contact_email: lead.email || null,
      phone: lead.telephone || '',
      profession: niche,
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
      niche,
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
    collected: newLeads.length,
    collectTotal: newLeads.length,
    enriched: newLeads.length,
    enrichTotal: newLeads.length,
    withPhone,
    withoutPhone,
    inserted,
  })

  return inserted
}
