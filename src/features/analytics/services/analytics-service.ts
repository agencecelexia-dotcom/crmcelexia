import { supabase } from '@/lib/supabase/client'
import type { PerformanceStats, KeyRates } from '@/types'

export async function getPerformanceStats(commercialId?: string): Promise<PerformanceStats> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  // Signed devis this month = CA
  let devisQuery = supabase
    .from('devis')
    .select('amount_ht, amount_ttc, client:clients!devis_client_id_fkey(commercial_id)')
    .eq('status', 'signe')
    .is('deleted_at', null)

  const { data: allSignedDevis } = await devisQuery
  const signedDevis = (allSignedDevis ?? []) as unknown as { amount_ht: number; amount_ttc: number; client?: { commercial_id: string } }[]

  let filteredDevis = signedDevis
  if (commercialId) {
    filteredDevis = signedDevis.filter(d => d.client?.commercial_id === commercialId)
  }

  const caGenerated = filteredDevis.reduce((sum, d) => sum + (d.amount_ht || 0), 0)
  const dealsWon = filteredDevis.length

  // MRR from active projects
  let projectsQuery = supabase
    .from('projects')
    .select('monthly_amount, client:clients!projects_client_id_fkey(commercial_id)')
    .in('status', ['en_cours', 'onboarding'])
    .is('deleted_at', null)

  const { data: projects } = await projectsQuery
  let activeProjects = (projects ?? []) as unknown as { monthly_amount: number | null; client?: { commercial_id: string } }[]

  if (commercialId) {
    activeProjects = activeProjects.filter(p => p.client?.commercial_id === commercialId)
  }

  const mrrGenerated = activeProjects.reduce((sum, p) => sum + (p.monthly_amount ?? 0), 0)

  // Deals lost
  let lostQuery = supabase
    .from('prospects')
    .select('id, commercial_id')
    .eq('status', 'perdu')
    .is('deleted_at', null)

  const { data: lostProspects } = await lostQuery
  let filteredLost = (lostProspects ?? []) as { id: string; commercial_id: string }[]
  if (commercialId) {
    filteredLost = filteredLost.filter(p => p.commercial_id === commercialId)
  }
  const dealsLost = filteredLost.length

  // Closing rate
  const totalDeals = dealsWon + dealsLost
  const closingRate = totalDeals > 0 ? (dealsWon / totalDeals) * 100 : 0

  // Average basket
  const averageBasket = dealsWon > 0 ? caGenerated / dealsWon : 0

  // CA this month - from devis signed this month
  let monthDevisQuery = supabase
    .from('devis')
    .select('amount_ht, signed_at, client:clients!devis_client_id_fkey(commercial_id)')
    .eq('status', 'signe')
    .is('deleted_at', null)
    .gte('signed_at', monthStart)
    .lt('signed_at', monthEnd)

  const { data: monthDevis } = await monthDevisQuery
  let filteredMonthDevis = (monthDevis ?? []) as unknown as { amount_ht: number; signed_at: string; client?: { commercial_id: string } }[]
  if (commercialId) {
    filteredMonthDevis = filteredMonthDevis.filter(d => d.client?.commercial_id === commercialId)
  }
  const caThisMonth = filteredMonthDevis.reduce((sum, d) => sum + (d.amount_ht || 0), 0)

  return {
    ca_generated: caGenerated,
    closing_rate: Math.round(closingRate * 10) / 10,
    average_basket: Math.round(averageBasket),
    mrr_generated: mrrGenerated,
    ca_this_month: caThisMonth,
    deals_won: dealsWon,
    deals_lost: dealsLost,
  }
}

export async function getKeyRates(commercialId?: string): Promise<KeyRates> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  // Calls this month
  let callsQuery = supabase
    .from('calls')
    .select('id, commercial_id, result')
    .gte('called_at', monthStart)
    .lt('called_at', monthEnd)

  const { data: calls } = await callsQuery
  let filteredCalls = (calls ?? []) as { id: string; commercial_id: string; result: string }[]
  if (commercialId) {
    filteredCalls = filteredCalls.filter(c => c.commercial_id === commercialId)
  }

  const totalCalls = filteredCalls.length
  const callsToRdv = filteredCalls.filter(c => c.result === 'reached_rdv').length

  // RDV this month
  let rdvQuery = supabase
    .from('rendez_vous')
    .select('id, commercial_id, status')
    .is('deleted_at', null)
    .gte('scheduled_at', monthStart)
    .lt('scheduled_at', monthEnd)

  const { data: rdvs } = await rdvQuery
  let filteredRdvs = (rdvs ?? []) as { id: string; commercial_id: string; status: string }[]
  if (commercialId) {
    filteredRdvs = filteredRdvs.filter(r => r.commercial_id === commercialId)
  }
  const totalRdv = filteredRdvs.length

  // Conversions this month
  let convQuery = supabase
    .from('prospects')
    .select('id, commercial_id')
    .eq('status', 'converti_client')
    .gte('converted_at', monthStart)
    .lt('converted_at', monthEnd)

  const { data: conversions } = await convQuery
  let filteredConv = (conversions ?? []) as { id: string; commercial_id: string }[]
  if (commercialId) {
    filteredConv = filteredConv.filter(c => c.commercial_id === commercialId)
  }
  const totalConversions = filteredConv.length

  // Lost this month
  let lostQuery = supabase
    .from('prospects')
    .select('id, commercial_id')
    .eq('status', 'perdu')
    .is('deleted_at', null)

  const { data: lost } = await lostQuery
  let filteredLost = (lost ?? []) as { id: string; commercial_id: string }[]
  if (commercialId) {
    filteredLost = filteredLost.filter(l => l.commercial_id === commercialId)
  }

  const totalDeals = totalConversions + filteredLost.length

  const callToRdvRate = totalCalls > 0 ? (callsToRdv / totalCalls) * 100 : 0
  const rdvToClosingRate = totalRdv > 0 ? (totalConversions / totalRdv) * 100 : 0
  const globalClosingRate = totalDeals > 0 ? (totalConversions / totalDeals) * 100 : 0

  // Performance stats for CA
  const perfStats = await getPerformanceStats(commercialId)

  // CAC (appels par conversion)
  const cac = totalConversions > 0 ? totalCalls / totalConversions : 0

  // Contact rate: calls that reached someone
  const reachedCalls = filteredCalls.filter(c =>
    ['reached_interested', 'reached_not_interested', 'reached_callback', 'reached_rdv'].includes(c.result)
  ).length
  const contactRate = totalCalls > 0 ? (reachedCalls / totalCalls) * 100 : 0

  return {
    call_to_rdv_rate: Math.round(callToRdvRate * 10) / 10,
    rdv_to_closing_rate: Math.round(rdvToClosingRate * 10) / 10,
    global_closing_rate: Math.round(globalClosingRate * 10) / 10,
    cac: Math.round(cac * 10) / 10,
    contact_rate: Math.round(contactRate * 10) / 10,
    ca_this_month: perfStats.ca_this_month,
    mrr_this_month: perfStats.mrr_generated,
    average_basket: perfStats.average_basket,
  }
}

export interface CommercialClosingRate {
  id: string
  full_name: string
  total_prospects: number
  converted: number
  lost: number
  closing_rate: number
  ca_generated: number
  calls_count: number
  rdv_count: number
  call_to_rdv_rate: number
  rdv_to_closing_rate: number
}

export async function getCommercialClosingRates(): Promise<CommercialClosingRate[]> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  const [profilesRes, conversionsRes, lostRes, callsRes, rdvsRes, devisRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('is_active', true).in('role', ['commercial', 'co_fondateur', 'fondateur']),
    supabase.from('prospects').select('commercial_id').eq('status', 'converti_client').gte('converted_at', monthStart).lt('converted_at', monthEnd),
    supabase.from('prospects').select('commercial_id').eq('status', 'perdu').is('deleted_at', null),
    supabase.from('calls').select('commercial_id, result').gte('called_at', monthStart).lt('called_at', monthEnd),
    supabase.from('rendez_vous').select('commercial_id, status').is('deleted_at', null).gte('scheduled_at', monthStart).lt('scheduled_at', monthEnd),
    supabase.from('devis').select('amount_ht, client:clients!devis_client_id_fkey(commercial_id)').eq('status', 'signe').is('deleted_at', null).gte('signed_at', monthStart).lt('signed_at', monthEnd),
  ])

  const profiles = (profilesRes.data ?? []) as { id: string; full_name: string }[]
  const conversions = (conversionsRes.data ?? []) as { commercial_id: string }[]
  const lost = (lostRes.data ?? []) as { commercial_id: string }[]
  const calls = (callsRes.data ?? []) as { commercial_id: string; result: string }[]
  const rdvs = (rdvsRes.data ?? []) as { commercial_id: string; status: string }[]
  const devis = (devisRes.data ?? []) as unknown as { amount_ht: number; client?: { commercial_id: string } }[]

  return profiles.map(p => {
    const converted = conversions.filter(c => c.commercial_id === p.id).length
    const lostCount = lost.filter(l => l.commercial_id === p.id).length
    const total = converted + lostCount
    const closingRate = total > 0 ? (converted / total) * 100 : 0

    const pCalls = calls.filter(c => c.commercial_id === p.id)
    const callsToRdv = pCalls.filter(c => c.result === 'reached_rdv').length
    const pRdvs = rdvs.filter(r => r.commercial_id === p.id)
    const ca = devis.filter(d => d.client?.commercial_id === p.id).reduce((sum, d) => sum + (d.amount_ht || 0), 0)

    return {
      id: p.id,
      full_name: p.full_name,
      total_prospects: total,
      converted,
      lost: lostCount,
      closing_rate: Math.round(closingRate * 10) / 10,
      ca_generated: ca,
      calls_count: pCalls.length,
      rdv_count: pRdvs.length,
      call_to_rdv_rate: pCalls.length > 0 ? Math.round((callsToRdv / pCalls.length) * 1000) / 10 : 0,
      rdv_to_closing_rate: pRdvs.length > 0 ? Math.round((converted / pRdvs.length) * 1000) / 10 : 0,
    }
  }).sort((a, b) => b.closing_rate - a.closing_rate)
}

export interface LossReasonStats {
  reason: string
  label: string
  count: number
  percentage: number
}

export async function getLossReasonStats(commercialId?: string): Promise<LossReasonStats[]> {
  let query = supabase
    .from('prospects')
    .select('custom_fields, commercial_id')
    .eq('status', 'perdu')
    .is('deleted_at', null)

  if (commercialId) {
    query = query.eq('commercial_id', commercialId)
  }

  const { data, error } = await query

  if (error) throw error

  const reasons: Record<string, number> = {}
  let total = 0

  for (const p of (data ?? []) as { custom_fields: Record<string, unknown> }[]) {
    const reason = (p.custom_fields?.loss_reason as string) ?? 'non_renseigne'
    reasons[reason] = (reasons[reason] ?? 0) + 1
    total++
  }

  const { LOSS_REASON_LABELS } = await import('@/types/enums')

  return Object.entries(reasons)
    .map(([reason, count]) => ({
      reason,
      label: (LOSS_REASON_LABELS as Record<string, string>)[reason] ?? 'Non renseigné',
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
}

// ── Niche x Hour Heatmap — which niche to call at which hour ──

export interface NicheHourCell {
  niche: string
  hour: number // 7-19
  total: number
  reached: number
  rate: number // contact rate %
}

export interface NicheHeatmapData {
  cells: NicheHourCell[]
  niches: string[] // sorted by overall contact rate (best first)
  hours: number[]  // 7-19
}

// Map NAF code → sub-niche label using the generation categories
function nafToSubNiche(codeNaf: string | null, profession: string | null): string {
  if (!codeNaf) return profession || 'Non renseigné'

  // Lazy-import to avoid circular deps at module level
  const categories: { label: string; subNiches: { label: string; codes: string[] }[] }[] = [
    {
      label: 'Artisan Batiment',
      subNiches: [
        { label: 'Couvreur', codes: ['43.91B'] },
        { label: 'Charpentier', codes: ['43.91A'] },
        { label: 'Électricien', codes: ['43.21A', '43.21B'] },
        { label: 'Plombier', codes: ['43.22A'] },
        { label: 'Chauffagiste', codes: ['43.22B'] },
        { label: 'Peintre', codes: ['43.34Z'] },
        { label: 'Plaquiste', codes: ['43.31Z'] },
        { label: 'Menuisier', codes: ['43.32A', '43.32B'] },
        { label: 'Carreleur', codes: ['43.33Z'] },
        { label: 'Maçon', codes: ['43.99C'] },
        { label: 'Isolation', codes: ['43.29A'] },
        { label: 'Terrassement', codes: ['43.12A', '43.12B'] },
        { label: 'Démolition', codes: ['43.11Z'] },
        { label: 'Étanchéité', codes: ['43.99A'] },
        { label: 'Structure métal.', codes: ['43.99B'] },
        { label: 'Paysagiste', codes: ['81.30Z'] },
      ],
    },
    {
      label: 'Beauté / Bien-être',
      subNiches: [
        { label: 'Coiffure', codes: ['96.02A'] },
        { label: 'Soins beauté', codes: ['96.02B'] },
        { label: 'Entretien corporel', codes: ['96.04Z'] },
        { label: 'Autres soins', codes: ['96.09Z'] },
      ],
    },
  ]

  const code = codeNaf.trim()
  for (const cat of categories) {
    for (const sub of cat.subNiches) {
      if (sub.codes.includes(code)) return sub.label
    }
  }

  // Fallback: use profession field, strip category prefix if present
  if (profession) {
    const parts = profession.split(' > ')
    return parts.length > 1 ? parts[parts.length - 1] : profession
  }
  return 'Autre'
}

export async function getCallHeatmapData(commercialId?: string): Promise<NicheHeatmapData> {
  const now = new Date()
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString()

  let query = supabase
    .from('calls')
    .select('called_at, result, commercial_id, prospect:prospects!calls_prospect_id_fkey(profession, code_naf)')
    .gte('called_at', threeMonthsAgo)

  if (commercialId) {
    query = query.eq('commercial_id', commercialId)
  }

  const { data } = await query
  const calls = (data ?? []) as unknown as { called_at: string; result: string; prospect?: { profession: string | null; code_naf: string | null } }[]

  const reachedResults = new Set(['reached_interested', 'reached_not_interested', 'reached_callback', 'reached_rdv'])

  // Aggregate by sub-niche x hour
  const grid: Record<string, { total: number; reached: number }> = {}
  const nicheStats: Record<string, { total: number; reached: number }> = {}

  for (const c of calls) {
    const niche = nafToSubNiche(c.prospect?.code_naf ?? null, c.prospect?.profession ?? null)
    const dt = new Date(c.called_at)
    const hour = dt.getHours()
    if (hour < 7 || hour > 19) continue // business hours only

    const key = `${niche}|${hour}`
    if (!grid[key]) grid[key] = { total: 0, reached: 0 }
    grid[key].total++
    if (reachedResults.has(c.result)) grid[key].reached++

    if (!nicheStats[niche]) nicheStats[niche] = { total: 0, reached: 0 }
    nicheStats[niche].total++
    if (reachedResults.has(c.result)) nicheStats[niche].reached++
  }

  // Keep top 12 sub-niches with at least 3 calls, sorted by contact rate
  const niches = Object.entries(nicheStats)
    .filter(([, v]) => v.total >= 3)
    .sort((a, b) => (b[1].reached / b[1].total) - (a[1].reached / a[1].total))
    .slice(0, 12)
    .map(([n]) => n)

  const hours = Array.from({ length: 13 }, (_, i) => i + 7)

  const cells: NicheHourCell[] = []
  for (const niche of niches) {
    for (const hour of hours) {
      const v = grid[`${niche}|${hour}`] ?? { total: 0, reached: 0 }
      cells.push({
        niche,
        hour,
        total: v.total,
        reached: v.reached,
        rate: v.total > 0 ? Math.round((v.reached / v.total) * 100) : 0,
      })
    }
  }

  return { cells, niches, hours }
}

// ── Performance by Niche ──

export interface NichePerformance {
  niche: string
  total_calls: number
  reached: number
  rdv: number
  contact_rate: number
  rdv_rate: number
}

export async function getPerformanceByNiche(commercialId?: string): Promise<NichePerformance[]> {
  const now = new Date()
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString()

  let query = supabase
    .from('calls')
    .select('result, commercial_id, prospect:prospects!calls_prospect_id_fkey(profession, code_naf)')
    .gte('called_at', threeMonthsAgo)

  if (commercialId) {
    query = query.eq('commercial_id', commercialId)
  }

  const { data } = await query
  const calls = (data ?? []) as unknown as { result: string; prospect?: { profession: string | null; code_naf: string | null } }[]

  const reachedResults = new Set(['reached_interested', 'reached_not_interested', 'reached_callback', 'reached_rdv'])
  const nicheMap: Record<string, { total: number; reached: number; rdv: number }> = {}

  for (const c of calls) {
    const niche = nafToSubNiche(c.prospect?.code_naf ?? null, c.prospect?.profession ?? null)
    if (!nicheMap[niche]) nicheMap[niche] = { total: 0, reached: 0, rdv: 0 }
    nicheMap[niche].total++
    if (reachedResults.has(c.result)) nicheMap[niche].reached++
    if (c.result === 'reached_rdv') nicheMap[niche].rdv++
  }

  return Object.entries(nicheMap)
    .map(([niche, v]) => ({
      niche,
      total_calls: v.total,
      reached: v.reached,
      rdv: v.rdv,
      contact_rate: v.total > 0 ? Math.round((v.reached / v.total) * 100) : 0,
      rdv_rate: v.total > 0 ? Math.round((v.rdv / v.total) * 1000) / 10 : 0,
    }))
    .filter(n => n.total_calls >= 5) // minimum sample size
    .sort((a, b) => b.contact_rate - a.contact_rate)
}

// ── CA Trend (12 months) ──

export interface CATrendPoint {
  month: string // "Jan", "Fév", etc.
  ca: number
  monthKey: string // "2026-01"
}

export async function getCATrend(commercialId?: string): Promise<CATrendPoint[]> {
  const now = new Date()
  const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString()

  let query = supabase
    .from('devis')
    .select('amount_ht, signed_at, client:clients!devis_client_id_fkey(commercial_id)')
    .eq('status', 'signe')
    .is('deleted_at', null)
    .gte('signed_at', twelveMonthsAgo)

  const { data } = await query
  let devis = (data ?? []) as unknown as { amount_ht: number; signed_at: string; client?: { commercial_id: string } }[]

  if (commercialId) {
    devis = devis.filter(d => d.client?.commercial_id === commercialId)
  }

  const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
  const result: CATrendPoint[] = []

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const monthDevis = devis.filter(dv => {
      const sd = new Date(dv.signed_at)
      return sd.getFullYear() === d.getFullYear() && sd.getMonth() === d.getMonth()
    })
    result.push({
      month: monthNames[d.getMonth()],
      ca: monthDevis.reduce((sum, dv) => sum + (dv.amount_ht || 0), 0),
      monthKey,
    })
  }

  return result
}

// ── Objectives persistence ──

export interface ObjectiveValues {
  target_mrr: number
  target_ca: number
  target_closing_rate: number
  target_rdv_rate: number
}

export async function getObjectives(commercialId: string): Promise<ObjectiveValues> {
  const { data } = await supabase
    .from('commercial_targets')
    .select('target_mrr, target_ca, target_closing_rate, target_rdv_rate')
    .eq('commercial_id', commercialId)
    .single()

  if (data) {
    return {
      target_mrr: Number(data.target_mrr) || 5000,
      target_ca: Number(data.target_ca) || 20000,
      target_closing_rate: Number(data.target_closing_rate) || 25,
      target_rdv_rate: Number(data.target_rdv_rate) || 10,
    }
  }

  return { target_mrr: 5000, target_ca: 20000, target_closing_rate: 25, target_rdv_rate: 10 }
}

export async function saveObjectives(commercialId: string, objectives: ObjectiveValues): Promise<void> {
  const { error } = await supabase
    .from('commercial_targets')
    .upsert({
      commercial_id: commercialId,
      target_mrr: objectives.target_mrr,
      target_ca: objectives.target_ca,
      target_closing_rate: objectives.target_closing_rate,
      target_rdv_rate: objectives.target_rdv_rate,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'commercial_id' })

  if (error) throw error
}

// ── Dashboard Comparisons (vs previous period) ──

export interface DashboardComparisons {
  calls_delta: number | null // % change vs previous period
  rdv_delta: number | null
  ca_delta: number | null
  conversion_delta: number | null
}

export async function getDashboardComparisons(commercialId?: string): Promise<DashboardComparisons> {
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = thisMonthStart

  // Current month calls
  let callsThisQ = supabase.from('calls').select('id, commercial_id').gte('called_at', thisMonthStart.toISOString())
  let callsLastQ = supabase.from('calls').select('id, commercial_id').gte('called_at', lastMonthStart.toISOString()).lt('called_at', lastMonthEnd.toISOString())

  if (commercialId) {
    callsThisQ = callsThisQ.eq('commercial_id', commercialId)
    callsLastQ = callsLastQ.eq('commercial_id', commercialId)
  }

  // RDV
  let rdvThisQ = supabase.from('rendez_vous').select('id, commercial_id').is('deleted_at', null).gte('scheduled_at', thisMonthStart.toISOString())
  let rdvLastQ = supabase.from('rendez_vous').select('id, commercial_id').is('deleted_at', null).gte('scheduled_at', lastMonthStart.toISOString()).lt('scheduled_at', lastMonthEnd.toISOString())

  if (commercialId) {
    rdvThisQ = rdvThisQ.eq('commercial_id', commercialId)
    rdvLastQ = rdvLastQ.eq('commercial_id', commercialId)
  }

  // CA
  let caThisQ = supabase.from('devis').select('amount_ht, client:clients!devis_client_id_fkey(commercial_id)').eq('status', 'signe').is('deleted_at', null).gte('signed_at', thisMonthStart.toISOString())
  let caLastQ = supabase.from('devis').select('amount_ht, client:clients!devis_client_id_fkey(commercial_id)').eq('status', 'signe').is('deleted_at', null).gte('signed_at', lastMonthStart.toISOString()).lt('signed_at', lastMonthEnd.toISOString())

  const [callsThis, callsLast, rdvThis, rdvLast, caThis, caLast] = await Promise.all([
    callsThisQ, callsLastQ, rdvThisQ, rdvLastQ, caThisQ, caLastQ,
  ])

  function filterByCommercial<T extends { commercial_id?: string }>(items: T[], cId?: string): T[] {
    if (!cId) return items
    return items.filter(i => i.commercial_id === cId)
  }

  const callsThisCount = filterByCommercial((callsThis.data ?? []) as { id: string; commercial_id: string }[], commercialId).length
  const callsLastCount = filterByCommercial((callsLast.data ?? []) as { id: string; commercial_id: string }[], commercialId).length

  const rdvThisCount = filterByCommercial((rdvThis.data ?? []) as { id: string; commercial_id: string }[], commercialId).length
  const rdvLastCount = filterByCommercial((rdvLast.data ?? []) as { id: string; commercial_id: string }[], commercialId).length

  type DevisRow = { amount_ht: number; client?: { commercial_id: string } }
  let caThisItems = (caThis.data ?? []) as unknown as DevisRow[]
  let caLastItems = (caLast.data ?? []) as unknown as DevisRow[]
  if (commercialId) {
    caThisItems = caThisItems.filter(d => d.client?.commercial_id === commercialId)
    caLastItems = caLastItems.filter(d => d.client?.commercial_id === commercialId)
  }
  const caThisTotal = caThisItems.reduce((s, d) => s + (d.amount_ht || 0), 0)
  const caLastTotal = caLastItems.reduce((s, d) => s + (d.amount_ht || 0), 0)

  function delta(current: number, previous: number): number | null {
    if (previous === 0) return current > 0 ? 100 : null
    return Math.round(((current - previous) / previous) * 100)
  }

  return {
    calls_delta: delta(callsThisCount, callsLastCount),
    rdv_delta: delta(rdvThisCount, rdvLastCount),
    ca_delta: delta(caThisTotal, caLastTotal),
    conversion_delta: null, // computed separately if needed
  }
}

// ── DSO (Days Sales Outstanding) ──

export interface DSOStats {
  dso: number // average days to get paid
  total_outstanding: number
  overdue_count: number
}

export async function getDSOStats(): Promise<DSOStats> {
  const { data } = await supabase
    .from('devis')
    .select('sent_at, signed_at, status, amount_ttc, valid_until')
    .is('deleted_at', null)
    .not('status', 'eq', 'brouillon')

  const devis = (data ?? []) as { sent_at: string | null; signed_at: string | null; status: string; amount_ttc: number; valid_until: string | null }[]

  // DSO = avg days between sent_at and signed_at for signed devis
  const paidDevis = devis.filter(d => d.status === 'signe' && d.sent_at && d.signed_at)
  let totalDays = 0
  for (const d of paidDevis) {
    const sent = new Date(d.sent_at!).getTime()
    const signed = new Date(d.signed_at!).getTime()
    totalDays += Math.max(0, Math.floor((signed - sent) / (1000 * 60 * 60 * 24)))
  }
  const dso = paidDevis.length > 0 ? Math.round(totalDays / paidDevis.length) : 0

  // Outstanding: sent but not signed
  const outstanding = devis.filter(d => d.status === 'envoye')
  const totalOutstanding = outstanding.reduce((s, d) => s + d.amount_ttc, 0)

  // Overdue
  const now = new Date()
  const overdue = outstanding.filter(d => {
    if (d.valid_until && new Date(d.valid_until) < now) return true
    if (d.sent_at) {
      const daysSince = Math.floor((now.getTime() - new Date(d.sent_at).getTime()) / (1000 * 60 * 60 * 24))
      return daysSince > 30
    }
    return false
  })

  return { dso, total_outstanding: totalOutstanding, overdue_count: overdue.length }
}
