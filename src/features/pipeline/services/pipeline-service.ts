import { supabase } from '@/lib/supabase/client'
import type { RendezVous } from '@/types'

// ── Upcoming RDVs (status = prevu or confirme, scheduled in future) ──
export async function getUpcomingRdvs(commercialId?: string): Promise<RendezVous[]> {
  let query = supabase
    .from('rendez_vous')
    .select(
      '*, prospect:prospects!rendez_vous_prospect_id_fkey(id, company_name, phone, contact_name, contact_firstname, city, status, converted_at)',
    )
    .is('deleted_at', null)
    .in('status', ['prevu', 'confirme'])
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })

  if (commercialId) {
    query = query.eq('commercial_id', commercialId)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as RendezVous[]
}

// ── Past RDVs not yet closed (scheduled before now, status not in terminal states) ──
export async function getPastUnconvertedRdvs(commercialId?: string): Promise<RendezVous[]> {
  let query = supabase
    .from('rendez_vous')
    .select(
      '*, prospect:prospects!rendez_vous_prospect_id_fkey(id, company_name, phone, contact_name, contact_firstname, city, status, converted_at)',
    )
    .is('deleted_at', null)
    .in('status', ['prevu', 'confirme', 'show', 'fait'])
    .lt('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: false })

  if (commercialId) {
    query = query.eq('commercial_id', commercialId)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as RendezVous[]
}

// ── Signed clients (prospects with status = converti_client) ──
export interface SignedClient {
  id: string
  company_name: string
  contact_name: string | null
  converted_at: string | null
  commercial_id: string
  // Last RDV info
  last_rdv_date: string | null
  last_rdv_booking_type: string | null
}

export async function getSignedClients(commercialId?: string): Promise<SignedClient[]> {
  let query = supabase
    .from('prospects')
    .select('id, company_name, contact_name, converted_at, commercial_id')
    .eq('status', 'converti_client')
    .is('deleted_at', null)
    .order('converted_at', { ascending: false })

  if (commercialId) {
    query = query.eq('commercial_id', commercialId)
  }

  const { data, error } = await query
  if (error) throw error

  // Fetch last RDV for each signed prospect
  const prospectIds = (data ?? []).map((p) => p.id)
  if (prospectIds.length === 0) {
    return []
  }

  const { data: rdvs, error: rdvError } = await supabase
    .from('rendez_vous')
    .select('prospect_id, scheduled_at, booking_type')
    .in('prospect_id', prospectIds)
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: false })

  if (rdvError) throw rdvError

  // Build map: prospect_id -> latest RDV
  const rdvMap: Record<string, { scheduled_at: string; booking_type: string | null }> = {}
  for (const r of rdvs ?? []) {
    if (!rdvMap[r.prospect_id]) {
      rdvMap[r.prospect_id] = { scheduled_at: r.scheduled_at, booking_type: r.booking_type }
    }
  }

  return (data ?? []).map((p) => ({
    id: p.id,
    company_name: p.company_name,
    contact_name: p.contact_name,
    converted_at: p.converted_at,
    commercial_id: p.commercial_id,
    last_rdv_date: rdvMap[p.id]?.scheduled_at ?? null,
    last_rdv_booking_type: rdvMap[p.id]?.booking_type ?? null,
  }))
}

// ── KPI: RDVs this month ──
export async function getRdvCountThisMonth(commercialId?: string): Promise<number> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  let query = supabase
    .from('rendez_vous')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .gte('scheduled_at', monthStart)
    .lt('scheduled_at', monthEnd)

  if (commercialId) {
    query = query.eq('commercial_id', commercialId)
  }

  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

// ── KPI: Signed clients this month ──
export async function getSignedCountThisMonth(commercialId?: string): Promise<number> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  let query = supabase
    .from('prospects')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'converti_client')
    .is('deleted_at', null)
    .gte('converted_at', monthStart)
    .lt('converted_at', monthEnd)

  if (commercialId) {
    query = query.eq('commercial_id', commercialId)
  }

  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

// ── KPI: Calls this week + this month ──
export async function getCallCounts(commercialId?: string): Promise<{ week: number; month: number }> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  // Calculate Monday of current week
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)) // Monday
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 7)

  // Month calls
  let monthQuery = supabase
    .from('calls')
    .select('id', { count: 'exact', head: true })
    .gte('called_at', monthStart)
    .lt('called_at', monthEnd)

  if (commercialId) {
    monthQuery = monthQuery.eq('commercial_id', commercialId)
  }

  // Week calls
  let weekQuery = supabase
    .from('calls')
    .select('id', { count: 'exact', head: true })
    .gte('called_at', weekStart.toISOString())
    .lt('called_at', weekEnd.toISOString())

  if (commercialId) {
    weekQuery = weekQuery.eq('commercial_id', commercialId)
  }

  const [monthRes, weekRes] = await Promise.all([monthQuery, weekQuery])

  if (monthRes.error) throw monthRes.error
  if (weekRes.error) throw weekRes.error

  return {
    week: weekRes.count ?? 0,
    month: monthRes.count ?? 0,
  }
}

// ── KPI: Conversion rate this month (RDV -> converti_client) ──
export async function getConversionRate(commercialId?: string): Promise<number> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  // Count RDVs this month
  let rdvQuery = supabase
    .from('rendez_vous')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .gte('scheduled_at', monthStart)
    .lt('scheduled_at', monthEnd)

  if (commercialId) {
    rdvQuery = rdvQuery.eq('commercial_id', commercialId)
  }

  // Count signed this month
  let signedQuery = supabase
    .from('prospects')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'converti_client')
    .is('deleted_at', null)
    .gte('converted_at', monthStart)
    .lt('converted_at', monthEnd)

  if (commercialId) {
    signedQuery = signedQuery.eq('commercial_id', commercialId)
  }

  const [rdvRes, signedRes] = await Promise.all([rdvQuery, signedQuery])

  if (rdvRes.error) throw rdvRes.error
  if (signedRes.error) throw signedRes.error

  const rdvCount = rdvRes.count ?? 0
  const signedCount = signedRes.count ?? 0

  if (rdvCount === 0) return 0
  return Math.round((signedCount / rdvCount) * 100)
}
