import { supabase } from '@/lib/supabase/client'
import type { Prospect, ProspectFilters, PaginatedResponse } from '@/types'
import { DEFAULT_PAGE_SIZE } from '@/lib/constants'

interface GetProspectsParams {
  filters?: ProspectFilters
  page?: number
  pageSize?: number
  sortBy?: string
  sortDesc?: boolean
}

export async function getProspects({
  filters = {},
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  sortBy = 'created_at',
  sortDesc = true,
}: GetProspectsParams): Promise<PaginatedResponse<Prospect>> {
  let query = supabase
    .from('prospects')
    .select('*, commercial:profiles!prospects_commercial_id_fkey(id, full_name, email)', { count: 'exact' })
    .is('deleted_at', null)

  // Apply filters
  if (filters.search) {
    query = query.or(`company_name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,contact_name.ilike.%${filters.search}%`)
  }

  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status)
  }

  if (filters.profession && filters.profession.length > 0) {
    query = query.in('profession', filters.profession)
  }

  if (filters.city && filters.city.length > 0) {
    query = query.in('city', filters.city)
  }

  if (filters.commercial_id) {
    query = query.eq('commercial_id', filters.commercial_id)
  }

  if (filters.import_id) {
    query = query.eq('import_id', filters.import_id)
  }

  if (filters.never_called) {
    query = query.eq('call_count', 0)
  }

  if (filters.has_reminder_today) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    query = query
      .gte('next_reminder_at', today.toISOString())
      .lt('next_reminder_at', tomorrow.toISOString())
  }

  if (filters.has_overdue_reminder) {
    query = query.lt('next_reminder_at', new Date().toISOString())
  }

  if (filters.date_from) {
    query = query.gte('created_at', filters.date_from)
  }

  if (filters.date_to) {
    query = query.lte('created_at', filters.date_to)
  }

  if (filters.last_called_from) {
    query = query.gte('last_called_at', filters.last_called_from)
  }

  if (filters.last_called_to) {
    query = query.lte('last_called_at', filters.last_called_to)
  }

  // Pagination
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  query = query
    .order(sortBy, { ascending: !sortDesc })
    .range(from, to)

  const { data, error, count } = await query

  if (error) throw error

  return {
    data: (data ?? []) as unknown as Prospect[],
    count: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  }
}

export async function getProspect(id: string): Promise<Prospect> {
  const { data, error } = await supabase
    .from('prospects')
    .select('*, commercial:profiles!prospects_commercial_id_fkey(id, full_name, email)')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as unknown as Prospect
}

export async function createProspect(prospect: Partial<Prospect>): Promise<Prospect> {
  const { data, error } = await supabase
    .from('prospects')
    .insert(prospect)
    .select()
    .single()

  if (error) throw error
  return data as Prospect
}

export async function updateProspect(id: string, updates: Partial<Prospect>): Promise<Prospect> {
  const { data, error } = await supabase
    .from('prospects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Prospect
}

export async function getDistinctProfessions(): Promise<string[]> {
  const { data, error } = await supabase
    .from('prospects')
    .select('profession')
    .not('profession', 'is', null)
    .is('deleted_at', null)

  if (error) throw error

  const unique = [...new Set((data ?? []).map((d) => d.profession as string))]
  return unique.sort()
}

export async function getDistinctCities(): Promise<string[]> {
  const { data, error } = await supabase
    .from('prospects')
    .select('city')
    .not('city', 'is', null)
    .is('deleted_at', null)

  if (error) throw error

  const unique = [...new Set((data ?? []).map((d) => d.city as string))]
  return unique.sort()
}
