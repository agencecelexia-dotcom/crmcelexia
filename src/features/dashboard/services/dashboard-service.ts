import { supabase } from '@/lib/supabase/client'

export interface FunnelStats {
  total_prospects: number
  appele_sans_reponse: number
  messagerie: number
  interesse: number
  a_rappeler: number
  rdv_pris: number
  converti_client: number
  negatif: number
  perdu: number
  nouveau: number
}

export interface CommercialKpis {
  calls_today: number
  calls_this_week: number
  reminders_today: number
  reminders_overdue: number
  rdv_this_week: number
  rdv_upcoming: number
  prospects_total: number
  conversion_rate: number
}

export interface CommercialRanking {
  id: string
  full_name: string
  calls_count: number
  rdv_count: number
  conversion_count: number
}

// Get prospect status distribution (funnel)
export async function getFunnelStats(commercialId?: string): Promise<FunnelStats> {
  let query = supabase
    .from('prospects')
    .select('status')
    .is('deleted_at', null)

  if (commercialId) {
    query = query.eq('commercial_id', commercialId)
  }

  const { data, error } = await query

  if (error) throw error

  const stats: FunnelStats = {
    total_prospects: 0,
    nouveau: 0,
    appele_sans_reponse: 0,
    messagerie: 0,
    interesse: 0,
    a_rappeler: 0,
    rdv_pris: 0,
    converti_client: 0,
    negatif: 0,
    perdu: 0,
  }

  for (const row of data ?? []) {
    stats.total_prospects++
    const status = row.status as keyof FunnelStats
    if (status in stats && status !== 'total_prospects') {
      ;(stats[status] as number)++
    }
  }

  return stats
}

// Get calls count for a period
export async function getCallsCount(params: {
  commercialId?: string
  dateFrom: string
  dateTo: string
}): Promise<number> {
  let query = supabase
    .from('calls')
    .select('id', { count: 'exact', head: true })
    .gte('called_at', params.dateFrom)
    .lt('called_at', params.dateTo)

  if (params.commercialId) {
    query = query.eq('commercial_id', params.commercialId)
  }

  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

// Get RDV count for a period
export async function getRdvCount(params: {
  commercialId?: string
  dateFrom: string
  dateTo: string
  status?: string
}): Promise<number> {
  let query = supabase
    .from('rendez_vous')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .gte('scheduled_at', params.dateFrom)
    .lt('scheduled_at', params.dateTo)

  if (params.commercialId) {
    query = query.eq('commercial_id', params.commercialId)
  }

  if (params.status) {
    query = query.eq('status', params.status)
  }

  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

// Get reminders count for today + overdue
export async function getRemindersCount(commercialId: string): Promise<{ today: number; overdue: number }> {
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(todayStart)
  todayEnd.setDate(todayEnd.getDate() + 1)

  const [todayRes, overdueRes] = await Promise.all([
    supabase
      .from('reminders')
      .select('id', { count: 'exact', head: true })
      .eq('commercial_id', commercialId)
      .eq('is_completed', false)
      .gte('remind_at', todayStart.toISOString())
      .lt('remind_at', todayEnd.toISOString()),
    supabase
      .from('reminders')
      .select('id', { count: 'exact', head: true })
      .eq('commercial_id', commercialId)
      .eq('is_completed', false)
      .lt('remind_at', todayStart.toISOString()),
  ])

  if (todayRes.error) throw todayRes.error
  if (overdueRes.error) throw overdueRes.error

  return {
    today: todayRes.count ?? 0,
    overdue: overdueRes.count ?? 0,
  }
}

// Get commercial ranking for founders
export async function getCommercialRanking(dateFrom: string, dateTo: string): Promise<CommercialRanking[]> {
  // Get all active profiles
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('is_active', true)
    .in('role', ['commercial', 'co_fondateur', 'fondateur'])

  if (profileError) throw profileError

  // Get call counts per commercial
  const { data: calls, error: callError } = await supabase
    .from('calls')
    .select('commercial_id')
    .gte('called_at', dateFrom)
    .lt('called_at', dateTo)

  if (callError) throw callError

  // Get RDV counts per commercial
  const { data: rdvs, error: rdvError } = await supabase
    .from('rendez_vous')
    .select('commercial_id')
    .is('deleted_at', null)
    .gte('scheduled_at', dateFrom)
    .lt('scheduled_at', dateTo)

  if (rdvError) throw rdvError

  // Get conversion counts per commercial
  const { data: conversions, error: convError } = await supabase
    .from('prospects')
    .select('commercial_id')
    .eq('status', 'converti_client')
    .gte('converted_at', dateFrom)
    .lt('converted_at', dateTo)

  if (convError) throw convError

  // Aggregate
  const callCounts: Record<string, number> = {}
  for (const c of calls ?? []) {
    callCounts[c.commercial_id] = (callCounts[c.commercial_id] ?? 0) + 1
  }

  const rdvCounts: Record<string, number> = {}
  for (const r of rdvs ?? []) {
    rdvCounts[r.commercial_id] = (rdvCounts[r.commercial_id] ?? 0) + 1
  }

  const convCounts: Record<string, number> = {}
  for (const c of conversions ?? []) {
    convCounts[c.commercial_id] = (convCounts[c.commercial_id] ?? 0) + 1
  }

  return (profiles ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    calls_count: callCounts[p.id] ?? 0,
    rdv_count: rdvCounts[p.id] ?? 0,
    conversion_count: convCounts[p.id] ?? 0,
  })).sort((a, b) => b.calls_count - a.calls_count)
}

// Weekly call stats for chart
export async function getWeeklyCallStats(params: {
  commercialId?: string
  weeks?: number
}): Promise<{ week: string; count: number }[]> {
  const numWeeks = params.weeks ?? 8
  const results: { week: string; count: number }[] = []

  for (let i = numWeeks - 1; i >= 0; i--) {
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1 - i * 7)
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    let query = supabase
      .from('calls')
      .select('id', { count: 'exact', head: true })
      .gte('called_at', weekStart.toISOString())
      .lt('called_at', weekEnd.toISOString())

    if (params.commercialId) {
      query = query.eq('commercial_id', params.commercialId)
    }

    const { count, error } = await query
    if (error) throw error

    const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`
    results.push({ week: label, count: count ?? 0 })
  }

  return results
}
