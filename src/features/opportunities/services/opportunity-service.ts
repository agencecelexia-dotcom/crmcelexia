import { supabase } from '@/lib/supabase/client'
import type { Opportunity, PipelineStats } from '@/types'
import type { OpportunityStatus } from '@/types/enums'
import { DEFAULT_PAGE_SIZE } from '@/lib/constants'

const OPP_SELECT = '*, prospect:prospects!opportunities_prospect_id_fkey(id, company_name, phone), commercial:profiles!opportunities_commercial_id_fkey(id, full_name)'

export interface OpportunityFilters {
  search?: string
  status?: OpportunityStatus[]
  commercial_id?: string
  client_id?: string
  min_price?: number
  max_price?: number
}

export async function getOpportunities({
  filters = {},
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  filters?: OpportunityFilters
  page?: number
  pageSize?: number
}) {
  let query = supabase
    .from('opportunities')
    .select(OPP_SELECT, { count: 'exact' })
    .is('deleted_at', null)

  if (filters.search) {
    const s = filters.search.replace(/[%_\\]/g, '\\$&')
    query = query.or(`name.ilike.%${s}%`)
  }

  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status)
  }

  if (filters.commercial_id) {
    query = query.eq('commercial_id', filters.commercial_id)
  }

  if (filters.client_id) {
    query = query.eq('client_id', filters.client_id)
  }

  if (filters.min_price !== undefined) {
    query = query.gte('project_price', filters.min_price)
  }

  if (filters.max_price !== undefined) {
    query = query.lte('project_price', filters.max_price)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  query = query.order('created_at', { ascending: false }).range(from, to)

  const { data, error, count } = await query

  if (error) throw error

  return {
    data: (data ?? []) as unknown as Opportunity[],
    count: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  }
}

export async function getOpportunity(id: string): Promise<Opportunity> {
  const { data, error } = await supabase
    .from('opportunities')
    .select(OPP_SELECT)
    .eq('id', id)
    .single()

  if (error) throw error
  return data as unknown as Opportunity
}

export async function getOpportunitiesForKanban(commercialId?: string): Promise<Opportunity[]> {
  let query = supabase
    .from('opportunities')
    .select(OPP_SELECT)
    .is('deleted_at', null)

  if (commercialId) {
    query = query.eq('commercial_id', commercialId)
  }

  query = query.order('updated_at', { ascending: false })

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as Opportunity[]
}

export async function getOpportunitiesForClient(clientId: string): Promise<Opportunity[]> {
  const { data, error } = await supabase
    .from('opportunities')
    .select(OPP_SELECT)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as Opportunity[]
}

export async function createOpportunity(params: {
  prospect_id: string
  client_id?: string | null
  commercial_id: string
  name: string
  project_price: number
  expected_close_date?: string | null
  notes?: string | null
}): Promise<Opportunity> {
  const { data, error } = await supabase
    .from('opportunities')
    .insert({
      ...params,
      status: 'site_a_envoyer',
      amount_collected: 0,
    })
    .select()
    .single()

  if (error) throw error
  return data as unknown as Opportunity
}

export async function updateOpportunity(id: string, updates: Partial<Opportunity>): Promise<Opportunity> {
  const { data, error } = await supabase
    .from('opportunities')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as unknown as Opportunity
}

export async function updateOpportunityStatus(
  id: string,
  newStatus: OpportunityStatus,
  extra?: { loss_reason?: string; loss_notes?: string; death_reason?: string; recall_date?: string },
): Promise<Opportunity> {
  const updates: Record<string, unknown> = { status: newStatus }
  if (extra?.loss_reason) updates.loss_reason = extra.loss_reason
  if (extra?.loss_notes) updates.loss_notes = extra.loss_notes
  if (extra?.death_reason) updates.death_reason = extra.death_reason
  if (extra?.recall_date) updates.recall_date = extra.recall_date

  const { data, error } = await supabase
    .from('opportunities')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as unknown as Opportunity
}

export async function getPipelineStats(commercialId?: string): Promise<PipelineStats> {
  let query = supabase
    .from('opportunities')
    .select('status, project_price, amount_collected')
    .is('deleted_at', null)

  if (commercialId) {
    query = query.eq('commercial_id', commercialId)
  }

  const { data, error } = await query

  if (error) throw error

  const all = (data ?? []) as { status: string; project_price: number; amount_collected: number }[]

  const terminal = ['perdu', 'mort']
  const active = all.filter(o => !terminal.includes(o.status) && o.status !== 'close')
  const won = all.filter(o => o.status === 'close')
  const lost = all.filter(o => o.status === 'perdu')
  const dead = all.filter(o => o.status === 'mort')

  const nonTerminal = all.filter(o => !terminal.includes(o.status))
  const total_project_price = nonTerminal.reduce((sum, o) => sum + (o.project_price || 0), 0)
  const active_pipeline = active.reduce((sum, o) => sum + (o.project_price || 0), 0)

  const won_total = won.reduce((sum, o) => sum + (o.project_price || 0), 0)
  const close_collected = won.reduce((sum, o) => sum + (o.amount_collected || 0), 0)
  const close_pending = won_total - close_collected

  const stages = ['site_a_envoyer', 'site_envoye', 'rdv', 'en_attente_retour', 'close']
  const by_stage = stages.map(stage => {
    const stageOpps = nonTerminal.filter(o => o.status === stage)
    return {
      stage,
      total_price: stageOpps.reduce((sum, o) => sum + (o.project_price || 0), 0),
      count: stageOpps.length,
    }
  })

  return {
    total_project_price,
    close_collected,
    close_pending,
    active_pipeline,
    active_count: active.length,
    won_count: won.length,
    won_total,
    lost_count: lost.length,
    dead_count: dead.length,
    by_stage,
  }
}
