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

  // CAC (basic: number of converted / total cost - using calls as proxy)
  const cac = totalConversions > 0 ? totalCalls / totalConversions : 0

  return {
    call_to_rdv_rate: Math.round(callToRdvRate * 10) / 10,
    rdv_to_closing_rate: Math.round(rdvToClosingRate * 10) / 10,
    global_closing_rate: Math.round(globalClosingRate * 10) / 10,
    cac: Math.round(cac * 10) / 10,
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
