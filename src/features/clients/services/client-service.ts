import { supabase } from '@/lib/supabase/client'
import type { Client, Project, Devis, ProjectNote } from '@/types'
import type { ClientStatus } from '@/types/enums'
import { DEFAULT_PAGE_SIZE } from '@/lib/constants'
import { normalizePhone } from '@/lib/phone'

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
    const s = filters.search.replace(/[%_\\]/g, '\\$&')
    const sPhone = normalizePhone(filters.search)
    const orParts = [
      `company_name.ilike.%${s}%`,
      `contact_name.ilike.%${s}%`,
      `phone.ilike.%${s}%`,
    ]
    if (sPhone.length >= 4) {
      orParts.push(`phone_normalized.ilike.%${sPhone}%`)
    }
    query = query.or(orParts.join(','))
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

// Création manuelle d'un client (sans prospect du funnel)
export interface CreateClientManualInput {
  company_name: string
  contact_firstname: string
  contact_name: string
  contact_email: string
  phone: string
  profession: string | null
  city: string | null
  address: string | null
  converted_at: string  // ISO date (date de signature)
  status: ClientStatus
  notes: string | null
  commercial_id: string  // current user id
}

export async function createClientManually(input: CreateClientManualInput): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      ...input,
      source: 'manual',
      prospect_id: null,
      custom_fields: {},
    })
    .select()
    .single()

  if (error) throw error
  return data as unknown as Client
}

// Soft delete d'un client + log dans event_log
export async function softDeleteClient(id: string, actorId: string): Promise<void> {
  // 1. Lire le client courant pour le log
  const { data: current, error: readErr } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()
  if (readErr) throw readErr

  // 2. Soft delete
  const { error: deleteErr } = await supabase
    .from('clients')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (deleteErr) throw deleteErr

  // 3. Log dans event_log (immutable audit trail)
  await supabase.from('event_log').insert({
    event_type: 'soft_delete',
    entity_type: 'client',
    entity_id: id,
    actor_id: actorId,
    old_values: current,
    new_values: { deleted_at: new Date().toISOString() },
  })
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
  commercialId?: string
}) {
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? DEFAULT_PAGE_SIZE
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('devis')
    .select('*, client:clients!devis_client_id_fkey(id, company_name, commercial_id)', { count: 'exact' })
    .is('deleted_at', null)

  if (params?.commercialId) {
    query = query.eq('created_by', params.commercialId)
  }

  query = query.order('created_at', { ascending: false }).range(from, to)

  const { data, error, count } = await query

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

// All clients for map (no pagination)
export async function getAllClientsForMap(): Promise<Pick<Client, 'id' | 'company_name' | 'city' | 'address' | 'status'>[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, company_name, city, address, status')
    .is('deleted_at', null)

  if (error) throw error
  return (data ?? []) as Pick<Client, 'id' | 'company_name' | 'city' | 'address' | 'status'>[]
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
