import { supabase } from '@/lib/supabase/client'
import { startOfWeek } from 'date-fns'

export interface FunnelStats {
  total_prospects: number
  messagerie: number
  site_en_attente: number
  site_envoye: number
  a_rappeler: number
  rdv_pris: number
  converti_client: number
  negatif: number
  perdu: number
  nouveau: number
  faux_numero: number
}

export interface DashboardStats {
  calls_today: number
  calls_week: number
  rdv_week: number
  rdv_done_month: number
  rdv_no_show_month: number
  reminders_today: number
  reminders_overdue: number
  funnel: FunnelStats
  weekly_calls: { week: string; count: number }[]
  show_up_rate: number
}

export interface CommercialRanking {
  id: string
  full_name: string
  calls_count: number
  rdv_count: number
  conversion_count: number
}

// Single RPC call that returns ALL dashboard data
export async function getDashboardStats(commercialId?: string): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('get_dashboard_stats', {
    p_commercial_id: commercialId ?? null,
  })

  if (error) throw error

  const raw = data as Record<string, unknown>
  const funnelRaw = (raw.funnel ?? {}) as Record<string, number>

  const funnel: FunnelStats = {
    nouveau: funnelRaw.nouveau ?? 0,
    messagerie: funnelRaw.messagerie ?? 0,
    site_en_attente: funnelRaw.site_en_attente ?? 0,
    site_envoye: funnelRaw.site_envoye ?? 0,
    a_rappeler: funnelRaw.a_rappeler ?? 0,
    rdv_pris: funnelRaw.rdv_pris ?? 0,
    converti_client: funnelRaw.converti_client ?? 0,
    negatif: funnelRaw.negatif ?? 0,
    perdu: funnelRaw.perdu ?? 0,
    faux_numero: funnelRaw.faux_numero ?? 0,
    // Exclude faux_numero from total so it doesn't pollute conversion rates
    total_prospects: Object.values(funnelRaw).reduce((sum, v) => sum + (v ?? 0), 0) - (funnelRaw.faux_numero ?? 0),
  }

  const rdvDone = (raw.rdv_done_month as number) ?? 0
  const rdvNoShow = (raw.rdv_no_show_month as number) ?? 0
  const rdvTotal = rdvDone + rdvNoShow
  const showUpRate = rdvTotal > 0 ? Math.round((rdvDone / rdvTotal) * 100) : 100

  const weeklyCalls = (raw.weekly_calls as { week: string; count: number }[]) ?? []

  return {
    calls_today: (raw.calls_today as number) ?? 0,
    calls_week: (raw.calls_week as number) ?? 0,
    rdv_week: (raw.rdv_week as number) ?? 0,
    rdv_done_month: rdvDone,
    rdv_no_show_month: rdvNoShow,
    reminders_today: (raw.reminders_today as number) ?? 0,
    reminders_overdue: (raw.reminders_overdue as number) ?? 0,
    funnel,
    weekly_calls: weeklyCalls,
    show_up_rate: showUpRate,
  }
}

// Get commercial ranking for founders (only used in founder view)
export async function getCommercialRanking(): Promise<CommercialRanking[]> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  const [profilesRes, callsRes, rdvsRes, conversionsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .in('role', ['commercial', 'co_fondateur', 'fondateur']),
    supabase
      .from('calls')
      .select('commercial_id')
      .gte('called_at', monthStart)
      .lt('called_at', monthEnd),
    supabase
      .from('rendez_vous')
      .select('commercial_id')
      .is('deleted_at', null)
      .gte('scheduled_at', monthStart)
      .lt('scheduled_at', monthEnd),
    supabase
      .from('prospects')
      .select('commercial_id')
      .eq('status', 'converti_client')
      .gte('converted_at', monthStart)
      .lt('converted_at', monthEnd),
  ])

  if (profilesRes.error) throw profilesRes.error
  if (callsRes.error) throw callsRes.error
  if (rdvsRes.error) throw rdvsRes.error
  if (conversionsRes.error) throw conversionsRes.error

  const callCounts: Record<string, number> = {}
  for (const c of callsRes.data ?? []) {
    callCounts[c.commercial_id] = (callCounts[c.commercial_id] ?? 0) + 1
  }

  const rdvCounts: Record<string, number> = {}
  for (const r of rdvsRes.data ?? []) {
    rdvCounts[r.commercial_id] = (rdvCounts[r.commercial_id] ?? 0) + 1
  }

  const convCounts: Record<string, number> = {}
  for (const c of conversionsRes.data ?? []) {
    convCounts[c.commercial_id] = (convCounts[c.commercial_id] ?? 0) + 1
  }

  return (profilesRes.data ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    calls_count: callCounts[p.id] ?? 0,
    rdv_count: rdvCounts[p.id] ?? 0,
    conversion_count: convCounts[p.id] ?? 0,
  })).sort((a, b) => b.calls_count - a.calls_count)
}

// ── Commercial-specific stats for the enhanced dashboard ──

export interface CommercialExtraStats {
  rdv_booked_month: number
  rdv_booked_week: number
  calls_month: number
  signed_clients_month: number
}

/**
 * Fetch additional KPI data for a commercial:
 * - RDV booked (created_at based) this month and this week
 * - Total calls this month
 * - Signed clients (converti_client) this month
 */
export async function getCommercialExtraStats(commercialId: string): Promise<CommercialExtraStats> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString()

  const [rdvMonthRes, rdvWeekRes, callsMonthRes, signedRes] = await Promise.all([
    // RDV booked this month (created_at = booking date, not scheduled_at)
    supabase
      .from('rendez_vous')
      .select('id')
      .eq('commercial_id', commercialId)
      .is('deleted_at', null)
      .gte('created_at', monthStart)
      .lt('created_at', monthEnd),
    // RDV booked this week (created_at based)
    supabase
      .from('rendez_vous')
      .select('id')
      .eq('commercial_id', commercialId)
      .is('deleted_at', null)
      .gte('created_at', weekStart),
    // Calls this month
    supabase
      .from('calls')
      .select('id')
      .eq('commercial_id', commercialId)
      .gte('called_at', monthStart)
      .lt('called_at', monthEnd),
    // Signed clients this month
    supabase
      .from('prospects')
      .select('id')
      .eq('commercial_id', commercialId)
      .eq('status', 'converti_client')
      .gte('converted_at', monthStart)
      .lt('converted_at', monthEnd),
  ])

  return {
    rdv_booked_month: rdvMonthRes.data?.length ?? 0,
    rdv_booked_week: rdvWeekRes.data?.length ?? 0,
    calls_month: callsMonthRes.data?.length ?? 0,
    signed_clients_month: signedRes.data?.length ?? 0,
  }
}
