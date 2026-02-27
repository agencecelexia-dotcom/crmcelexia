import { supabase } from '@/lib/supabase/client'
import type { Prospect, ProspectFilters, PaginatedResponse } from '@/types'
import { DEFAULT_PAGE_SIZE, N8N_SITE_DEPLOY_WEBHOOK } from '@/lib/constants'

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
    .select('*, commercial:profiles!prospects_commercial_id_fkey(id, full_name, email), opportunities(id, status, deleted_at)', { count: 'exact' })
    .is('deleted_at', null)

  // Apply filters
  if (filters.search) {
    const s = filters.search.replace(/[%_\\]/g, '\\$&')
    query = query.or(`company_name.ilike.%${s}%,phone.ilike.%${s}%,contact_name.ilike.%${s}%`)
  }

  if (filters.status && filters.status.length > 0) {
    // Expand 'messagerie' to include legacy 'appele_sans_reponse' value
    const expandedStatuses = filters.status.flatMap(s =>
      s === 'messagerie' ? ['messagerie', 'appele_sans_reponse'] : [s]
    )
    query = query.in('status', expandedStatuses)
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

  if (filters.phone_prefixes && filters.phone_prefixes.length > 0) {
    // Build OR filter for multiple phone prefixes: phone.like.06%,phone.like.07%
    const orClauses = filters.phone_prefixes
      .map((p) => {
        const clean = p.replace(/[%_\\]/g, '\\$&').replace(/\s/g, '')
        return `phone.like.${clean}%`
      })
      .join(',')
    query = query.or(orClauses)
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

  if (updates.status === 'site_en_attente' && !data.website) {
    fetch(N8N_SITE_DEPLOY_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: data }),
    }).catch(err => console.error('[n8n] Site deploy webhook failed:', err))
  }

  return data as Prospect
}

export async function getDistinctProfessions(): Promise<string[]> {
  const { data, error } = await supabase
    .from('prospects')
    .select('profession')
    .not('profession', 'is', null)
    .is('deleted_at', null)
    .limit(5000)

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
    .limit(5000)

  if (error) throw error

  const unique = [...new Set((data ?? []).map((d) => d.city as string))]
  return unique.sort()
}

export async function deleteProspects(ids: string[]): Promise<void> {
  // Soft delete - set deleted_at
  const { error } = await supabase
    .from('prospects')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
  if (error) throw error
}

export async function assignProspects(ids: string[], commercialId: string): Promise<void> {
  const { error } = await supabase
    .from('prospects')
    .update({ commercial_id: commercialId })
    .in('id', ids)
  if (error) throw error
}

export async function assignProspectsSplit(
  ids: string[],
  assignments: { commercial_id: string; percentage: number }[]
): Promise<void> {
  // Distribute prospects proportionally
  const shuffled = [...ids].sort(() => Math.random() - 0.5)
  let offset = 0
  for (const { commercial_id, percentage } of assignments) {
    const count = Math.round((percentage / 100) * ids.length)
    const chunk = shuffled.slice(offset, offset + count)
    if (chunk.length > 0) {
      const { error } = await supabase
        .from('prospects')
        .update({ commercial_id })
        .in('id', chunk)
      if (error) throw error
    }
    offset += count
  }
  // Assign any remaining to last person
  if (offset < shuffled.length) {
    const lastCommercial = assignments[assignments.length - 1].commercial_id
    const remaining = shuffled.slice(offset)
    const { error } = await supabase
      .from('prospects')
      .update({ commercial_id: lastCommercial })
      .in('id', remaining)
    if (error) throw error
  }
}
