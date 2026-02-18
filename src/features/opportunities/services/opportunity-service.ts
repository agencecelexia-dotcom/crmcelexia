import { supabase } from '@/lib/supabase/client'
import type { Opportunity, PipelineStats } from '@/types'
import type { OpportunityStatus } from '@/types/enums'
import { DEFAULT_PAGE_SIZE } from '@/lib/constants'

export interface OpportunityFilters {
  search?: string
  status?: OpportunityStatus[]
  commercial_id?: string
  min_value?: number
  max_value?: number
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
    .select('*, prospect:prospects!opportunities_prospect_id_fkey(id, company_name, phone), commercial:profiles!opportunities_commercial_id_fkey(id, full_name)', { count: 'exact' })

  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%`)
  }

  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status)
  }

  if (filters.commercial_id) {
    query = query.eq('commercial_id', filters.commercial_id)
  }

  if (filters.min_value !== undefined) {
    query = query.gte('estimated_value', filters.min_value)
  }

  if (filters.max_value !== undefined) {
    query = query.lte('estimated_value', filters.max_value)
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
    .select('*, prospect:prospects!opportunities_prospect_id_fkey(id, company_name, phone, status), commercial:profiles!opportunities_commercial_id_fkey(id, full_name)')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as unknown as Opportunity
}

export async function createOpportunity(params: {
  prospect_id: string
  commercial_id: string
  name: string
  estimated_value: number
  probability: number
  monthly_recurring?: number | null
  expected_close_date?: string | null
  notes?: string | null
}): Promise<Opportunity> {
  const projected_revenue = params.estimated_value * (params.probability / 100)

  const { data, error } = await supabase
    .from('opportunities')
    .insert({
      ...params,
      projected_revenue,
      status: 'qualification',
    })
    .select()
    .single()

  if (error) throw error
  return data as unknown as Opportunity
}

export async function updateOpportunity(id: string, updates: Partial<Opportunity>): Promise<Opportunity> {
  if (updates.estimated_value !== undefined || updates.probability !== undefined) {
    const currentOpp = await getOpportunity(id)
    const val = updates.estimated_value ?? currentOpp.estimated_value
    const prob = updates.probability ?? currentOpp.probability
    updates.projected_revenue = val * (prob / 100)
  }

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
    .select('status, estimated_value, probability, projected_revenue, expected_close_date')
    .not('status', 'in', '("gagne","perdu")')

  if (commercialId) {
    query = query.eq('commercial_id', commercialId)
  }

  const { data, error } = await query

  if (error) throw error

  const opportunities = (data ?? []) as { status: string; estimated_value: number; probability: number; projected_revenue: number; expected_close_date: string | null }[]

  const now = new Date()

  const totalInProgress = opportunities.reduce((sum, o) => sum + (o.estimated_value || 0), 0)
  const forecastClosing = opportunities.reduce((sum, o) => sum + (o.projected_revenue || 0), 0)

  const projectionMonth = opportunities
    .filter(o => {
      if (!o.expected_close_date) return false
      const d = new Date(o.expected_close_date)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    .reduce((sum, o) => sum + (o.projected_revenue || 0), 0)

  const stages = ['qualification', 'proposition', 'negociation', 'closing']
  const byStage = stages.map(stage => {
    const stageOpps = opportunities.filter(o => o.status === stage)
    return {
      stage,
      amount: stageOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0),
      count: stageOpps.length,
    }
  })

  return {
    total_in_progress: totalInProgress,
    forecast_closing: forecastClosing,
    projection_month: projectionMonth,
    by_stage: byStage,
  }
}
