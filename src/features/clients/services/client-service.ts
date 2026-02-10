import { supabase } from '@/lib/supabase/client'
import type { Client, Project, Devis, ProjectNote } from '@/types'
import type { ClientStatus } from '@/types/enums'
import { DEFAULT_PAGE_SIZE } from '@/lib/constants'

export interface ClientFilters {
  search?: string
  status?: ClientStatus[]
  commercial_id?: string
}

interface GetClientsParams {
  filters?: ClientFilters
  page?: number
  pageSize?: number
  sortBy?: string
  sortDesc?: boolean
}

export async function getClients({
  filters = {},
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  sortBy = 'created_at',
  sortDesc = true,
}: GetClientsParams) {
  let query = supabase
    .from('clients')
    .select('*, commercial:profiles!clients_commercial_id_fkey(id, full_name)', { count: 'exact' })
    .is('deleted_at', null)

  if (filters.search) {
    query = query.or(`company_name.ilike.%${filters.search}%,contact_name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`)
  }

  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status)
  }

  if (filters.commercial_id) {
    query = query.eq('commercial_id', filters.commercial_id)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  query = query.order(sortBy, { ascending: !sortDesc }).range(from, to)

  const { data, error, count } = await query

  if (error) throw error

  return {
    data: (data ?? []) as unknown as Client[],
    count: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  }
}

export async function getClient(id: string): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .select('*, commercial:profiles!clients_commercial_id_fkey(id, full_name, email), prospect:prospects!clients_prospect_id_fkey(id, company_name, status, call_count)')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as unknown as Client
}

export async function updateClient(id: string, updates: Partial<Client>): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as unknown as Client
}

// Prospect conversion
export async function convertProspectToClient(prospectId: string): Promise<string> {
  const { data, error } = await supabase.rpc('convert_prospect_to_client', {
    p_prospect_id: prospectId,
  })

  if (error) throw error
  return data as string
}

// Projects
export async function getProjectForClient(clientId: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  return data as Project | null
}

export async function createProject(params: {
  client_id: string
  name: string
  description?: string | null
  monthly_amount?: number | null
  total_amount?: number | null
}): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .insert({
      ...params,
      status: 'onboarding',
    })
    .select()
    .single()

  if (error) throw error
  return data as Project
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Project
}

// Project notes
export async function getProjectNotes(projectId: string): Promise<ProjectNote[]> {
  const { data, error } = await supabase
    .from('project_notes')
    .select('*, author:profiles!project_notes_author_id_fkey(id, full_name)')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as ProjectNote[]
}

export async function createProjectNote(params: {
  project_id: string
  author_id: string
  content: string
}): Promise<ProjectNote> {
  const { data, error } = await supabase
    .from('project_notes')
    .insert(params)
    .select('*, author:profiles!project_notes_author_id_fkey(id, full_name)')
    .single()

  if (error) throw error
  return data as unknown as ProjectNote
}

// Devis
export async function getDevisForClient(clientId: string): Promise<Devis[]> {
  const { data, error } = await supabase
    .from('devis')
    .select('*')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Devis[]
}

export async function getAllDevis(params?: {
  page?: number
  pageSize?: number
}) {
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? DEFAULT_PAGE_SIZE
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await supabase
    .from('devis')
    .select('*, client:clients!devis_client_id_fkey(id, company_name)', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error

  return {
    data: (data ?? []) as unknown as (Devis & { client?: Client })[],
    count: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  }
}

export async function createDevis(params: {
  client_id: string
  project_id?: string | null
  amount_ht: number
  tax_rate: number
  valid_until?: string | null
  notes?: string | null
  created_by: string
}): Promise<Devis> {
  const { data, error } = await supabase
    .from('devis')
    .insert({
      ...params,
      amount_ttc: params.amount_ht * (1 + params.tax_rate / 100),
      status: 'brouillon',
    })
    .select()
    .single()

  if (error) throw error
  return data as Devis
}

export async function updateDevis(id: string, updates: Partial<Devis>): Promise<Devis> {
  const { data, error } = await supabase
    .from('devis')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Devis
}
