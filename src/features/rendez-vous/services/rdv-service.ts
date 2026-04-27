import { supabase } from '@/lib/supabase/client'
import type { RendezVous } from '@/types'
import type { RdvStatus, RdvType } from '@/types/enums'
import { DEFAULT_PAGE_SIZE } from '@/lib/constants'

interface GetRdvParams {
  filters?: RdvFilters
  page?: number
  pageSize?: number
  sortBy?: string
  sortDesc?: boolean
}

export interface RdvFilters {
  status?: RdvStatus[]
  type?: RdvType[]
  commercial_id?: string
  prospect_id?: string
  date_from?: string
  date_to?: string
  search?: string
}

export async function getRendezVous({
  filters = {},
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  sortBy = 'scheduled_at',
  sortDesc = false,
}: GetRdvParams) {
  let query = supabase
    .from('rendez_vous')
    .select(
      '*, prospect:prospects!rendez_vous_prospect_id_fkey(id, company_name, phone, contact_name, contact_firstname, city, profession), commercial:profiles!rendez_vous_commercial_id_fkey(id, full_name)',
      { count: 'exact' }
    )
    .is('deleted_at', null)

  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status)
  }

  if (filters.type && filters.type.length > 0) {
    query = query.in('type', filters.type)
  }

  if (filters.commercial_id) {
    query = query.eq('commercial_id', filters.commercial_id)
  }

  if (filters.prospect_id) {
    query = query.eq('prospect_id', filters.prospect_id)
  }

  if (filters.date_from) {
    query = query.gte('scheduled_at', filters.date_from)
  }

  if (filters.date_to) {
    query = query.lte('scheduled_at', filters.date_to)
  }

  if (filters.search) {
    const s = filters.search.replace(/[%_\\]/g, '\\$&')
    query = query.or(`notes.ilike.%${s}%`)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  query = query.order(sortBy, { ascending: !sortDesc }).range(from, to)

  const { data, error, count } = await query

  if (error) throw error

  return {
    data: (data ?? []) as unknown as RendezVous[],
    count: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  }
}

export async function getRdv(id: string): Promise<RendezVous> {
  const { data, error } = await supabase
    .from('rendez_vous')
    .select(
      '*, prospect:prospects!rendez_vous_prospect_id_fkey(id, company_name, phone, contact_name, contact_firstname), commercial:profiles!rendez_vous_commercial_id_fkey(id, full_name)'
    )
    .eq('id', id)
    .single()

  if (error) throw error
  return data as unknown as RendezVous
}

export async function getRdvForProspect(prospectId: string): Promise<RendezVous[]> {
  const { data, error } = await supabase
    .from('rendez_vous')
    .select('*, commercial:profiles!rendez_vous_commercial_id_fkey(id, full_name)')
    .eq('prospect_id', prospectId)
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as RendezVous[]
}

interface CreateRdvParams {
  prospect_id: string
  commercial_id: string
  scheduled_at: string
  duration_minutes: number
  type: RdvType
  location?: string | null
  meeting_url?: string | null
  notes?: string | null
  created_from_call_id?: string | null
}

export async function createRdv(params: CreateRdvParams): Promise<RendezVous> {
  const { data, error } = await supabase
    .from('rendez_vous')
    .insert({
      ...params,
      status: 'prevu' as RdvStatus,
    })
    .select('*, prospect:prospects!rendez_vous_prospect_id_fkey(id, company_name, phone)')
    .single()

  if (error) throw error
  return data as unknown as RendezVous
}

interface UpdateRdvParams {
  id: string
  updates: Partial<Pick<RendezVous, 'scheduled_at' | 'duration_minutes' | 'type' | 'status' | 'result' | 'location' | 'meeting_url' | 'notes' | 'no_show_reason'>>
}

export async function updateRdv({ id, updates }: UpdateRdvParams): Promise<RendezVous> {
  const { data, error } = await supabase
    .from('rendez_vous')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as unknown as RendezVous
}

interface RescheduleRdvParams {
  rdvId: string
  newScheduledAt: string
  newDurationMinutes?: number
}

export async function rescheduleRdv({ rdvId, newScheduledAt, newDurationMinutes }: RescheduleRdvParams): Promise<RendezVous> {
  // 1. Fetch the existing RDV
  const { data: oldRdv, error: fetchError } = await supabase
    .from('rendez_vous')
    .select('*')
    .eq('id', rdvId)
    .single()

  if (fetchError || !oldRdv) throw fetchError ?? new Error('RDV introuvable')

  // 2. Mark old RDV as no_show
  const { error: updateError } = await supabase
    .from('rendez_vous')
    .update({ status: 'no_show' as RdvStatus })
    .eq('id', rdvId)

  if (updateError) throw updateError

  // 3. Create new RDV with same details but new date
  const { data: newRdv, error: createError } = await supabase
    .from('rendez_vous')
    .insert({
      prospect_id: oldRdv.prospect_id,
      commercial_id: oldRdv.commercial_id,
      scheduled_at: newScheduledAt,
      duration_minutes: newDurationMinutes ?? oldRdv.duration_minutes,
      type: oldRdv.type,
      status: 'prevu' as RdvStatus,
      location: oldRdv.location,
      meeting_url: oldRdv.meeting_url,
      notes: oldRdv.notes,
    })
    .select()
    .single()

  if (createError) throw createError
  return newRdv as unknown as RendezVous
}

export async function getMyUpcomingRdv(commercialId: string): Promise<RendezVous[]> {
  const { data, error } = await supabase
    .from('rendez_vous')
    .select('*, prospect:prospects!rendez_vous_prospect_id_fkey(id, company_name, phone, contact_name, contact_firstname)')
    .eq('commercial_id', commercialId)
    .in('status', ['prevu', 'confirme'])
    .is('deleted_at', null)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(10)

  if (error) throw error
  return (data ?? []) as unknown as RendezVous[]
}

// ============================================================================
// Sectioned RDV list (Chantier 2 — refonte page liste RDV)
// ============================================================================

export type RdvSection = 'upcoming' | 'pending' | 'recall' | 'done'

const SECTION_SELECT =
  '*, prospect:prospects!rendez_vous_prospect_id_fkey(id, company_name, phone, contact_name, contact_firstname, city, profession), commercial:profiles!rendez_vous_commercial_id_fkey(id, full_name)'

export async function getRdvBySection(section: RdvSection): Promise<RendezVous[]> {
  const nowIso = new Date().toISOString()

  let query = supabase.from('rendez_vous').select(SECTION_SELECT).is('deleted_at', null)

  switch (section) {
    case 'upcoming':
      query = query
        .in('status', ['prevu', 'confirme'])
        .gt('scheduled_at', nowIso)
        .order('scheduled_at', { ascending: true })
      break
    case 'pending':
      query = query
        .in('status', ['prevu', 'confirme'])
        .lte('scheduled_at', nowIso)
        .order('scheduled_at', { ascending: false })
      break
    case 'recall':
      query = query
        .in('recall_status', ['to_do', 'in_progress'])
        .order('updated_at', { ascending: false })
      break
    case 'done': {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      query = query
        .in('status', ['show', 'no_show', 'fait', 'close', 'annule', 'perdu'])
        .gt('updated_at', since)
        .order('updated_at', { ascending: false })
        .limit(100)
      break
    }
  }

  const { data, error } = await query

  if (error) throw error
  return (data ?? []) as unknown as RendezVous[]
}

export interface RdvKpis {
  presenceRate30d: number
  r1ToR2Rate: number
  recallRecoveryRate: number
  weekUpcoming: number
}

export async function getRdvKpis(): Promise<RdvKpis> {
  const now = new Date()
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // weekUpcoming : RDV à venir cette semaine (lundi -> dimanche prochain)
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7)) // Monday
  startOfWeek.setHours(0, 0, 0, 0)
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 7)

  // 1) Présence sur 30 derniers jours : show ou no_show => taux de show
  const { data: presence30d, error: errPresence } = await supabase
    .from('rendez_vous')
    .select('status')
    .is('deleted_at', null)
    .in('status', ['show', 'no_show', 'fait', 'close'])
    .gte('updated_at', since30d)

  if (errPresence) throw errPresence

  const totalPresence = presence30d?.length ?? 0
  const presents = (presence30d ?? []).filter((r) => r.status !== 'no_show').length
  const presenceRate30d = totalPresence === 0 ? 0 : presents / totalPresence

  // 2) R1 -> R2 : sur les RDV avec rdv_index = 1 effectués (show/fait/close), proportion ayant un R2
  const { data: r1Rows, error: errR1 } = await supabase
    .from('rendez_vous')
    .select('prospect_id')
    .is('deleted_at', null)
    .eq('rdv_index', 1)
    .in('status', ['show', 'fait', 'close'])

  if (errR1) throw errR1

  const r1ProspectIds = Array.from(new Set((r1Rows ?? []).map((r) => r.prospect_id).filter(Boolean)))
  let r1ToR2Rate = 0
  if (r1ProspectIds.length > 0) {
    const { data: r2Rows, error: errR2 } = await supabase
      .from('rendez_vous')
      .select('prospect_id')
      .is('deleted_at', null)
      .eq('rdv_index', 2)
      .in('prospect_id', r1ProspectIds)

    if (errR2) throw errR2

    const r2ProspectIds = new Set((r2Rows ?? []).map((r) => r.prospect_id))
    r1ToR2Rate = r2ProspectIds.size / r1ProspectIds.length
  }

  // 3) Récupération no-shows : recall_status finalisé (recovered vs abandoned)
  const { data: recallRows, error: errRecall } = await supabase
    .from('rendez_vous')
    .select('recall_status')
    .is('deleted_at', null)
    .in('recall_status', ['recovered', 'abandoned'])

  if (errRecall) throw errRecall

  const totalRecallFinal = recallRows?.length ?? 0
  const recovered = (recallRows ?? []).filter((r) => r.recall_status === 'recovered').length
  const recallRecoveryRate = totalRecallFinal === 0 ? 0 : recovered / totalRecallFinal

  // 4) RDV à venir cette semaine
  const { count: weekUpcoming, error: errWeek } = await supabase
    .from('rendez_vous')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .in('status', ['prevu', 'confirme'])
    .gte('scheduled_at', startOfWeek.toISOString())
    .lt('scheduled_at', endOfWeek.toISOString())

  if (errWeek) throw errWeek

  return {
    presenceRate30d,
    r1ToR2Rate,
    recallRecoveryRate,
    weekUpcoming: weekUpcoming ?? 0,
  }
}

export type RecallResult = 'positive' | 'no_answer' | 'refusal' | 'unreachable'

export async function markRecallAttempt(rdvId: string, result: RecallResult): Promise<RendezVous> {
  const { data: current, error: fetchError } = await supabase
    .from('rendez_vous')
    .select('recall_attempts, recall_status')
    .eq('id', rdvId)
    .single()

  if (fetchError || !current) throw fetchError ?? new Error('RDV introuvable')

  let newAttempts = current.recall_attempts ?? 0
  let newStatus: 'recovered' | 'abandoned' | 'in_progress'

  if (result === 'positive') {
    newStatus = 'recovered'
  } else {
    newAttempts += 1
    newStatus = newAttempts >= 3 ? 'abandoned' : 'in_progress'
  }

  const { data, error } = await supabase
    .from('rendez_vous')
    .update({ recall_attempts: newAttempts, recall_status: newStatus })
    .eq('id', rdvId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as RendezVous
}

export async function cancelRdvWithReason(rdvId: string, reason: string): Promise<RendezVous> {
  const { data, error } = await supabase
    .from('rendez_vous')
    .update({ status: 'annule' as RdvStatus, cancelled_reason: reason })
    .eq('id', rdvId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as RendezVous
}

export async function getMyRdvThisWeek(commercialId: string): Promise<RendezVous[]> {
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay() + 1) // Monday
  startOfWeek.setHours(0, 0, 0, 0)
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 7)

  const { data, error } = await supabase
    .from('rendez_vous')
    .select('*, prospect:prospects!rendez_vous_prospect_id_fkey(id, company_name, phone)')
    .eq('commercial_id', commercialId)
    .is('deleted_at', null)
    .gte('scheduled_at', startOfWeek.toISOString())
    .lt('scheduled_at', endOfWeek.toISOString())
    .order('scheduled_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as RendezVous[]
}
