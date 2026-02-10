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
    // Search via prospect company name - requires RPC or filtering client-side
    // For now we filter after fetch
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

export async function getMyUpcomingRdv(commercialId: string): Promise<RendezVous[]> {
  const { data, error } = await supabase
    .from('rendez_vous')
    .select('*, prospect:prospects!rendez_vous_prospect_id_fkey(id, company_name, phone, contact_name, contact_firstname)')
    .eq('commercial_id', commercialId)
    .eq('status', 'prevu')
    .is('deleted_at', null)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(10)

  if (error) throw error
  return (data ?? []) as unknown as RendezVous[]
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
