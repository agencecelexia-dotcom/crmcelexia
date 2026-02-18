import { supabase } from '@/lib/supabase/client'
import type { Client, Project, Devis } from '@/types'

export interface ContractView {
  id: string
  reference: string
  clientName: string
  clientId: string
  projectName: string | null
  projectId: string | null
  amount_ht: number
  amount_ttc: number
  monthly_amount: number | null
  status: string
  signed_at: string | null
  start_date: string | null
  end_date: string | null
  created_at: string
}

export async function getContracts(commercialId?: string): Promise<ContractView[]> {
  // Contracts = signed devis linked to projects and clients
  let query = supabase
    .from('devis')
    .select('*, client:clients!devis_client_id_fkey(id, company_name, commercial_id), project:projects!devis_project_id_fkey(id, name, monthly_amount, start_date, end_date, status)')
    .eq('status', 'signe')
    .is('deleted_at', null)
    .order('signed_at', { ascending: false })

  const { data, error } = await query

  if (error) throw error

  const results = (data ?? []) as unknown as (Devis & { client?: Client; project?: Project })[]

  let contracts = results.map((d) => ({
    id: d.id,
    reference: d.reference,
    clientName: d.client?.company_name ?? 'Inconnu',
    clientId: d.client_id,
    projectName: (d as unknown as { project?: Project }).project?.name ?? null,
    projectId: d.project_id,
    amount_ht: d.amount_ht,
    amount_ttc: d.amount_ttc,
    monthly_amount: (d as unknown as { project?: Project }).project?.monthly_amount ?? null,
    status: (d as unknown as { project?: Project }).project?.status ?? 'actif',
    signed_at: d.signed_at,
    start_date: (d as unknown as { project?: Project }).project?.start_date ?? null,
    end_date: (d as unknown as { project?: Project }).project?.end_date ?? null,
    created_at: d.created_at,
  }))

  if (commercialId) {
    contracts = contracts.filter(c => {
      const match = results.find(r => r.id === c.id)
      return (match?.client as Client | undefined)?.commercial_id === commercialId
    })
  }

  return contracts
}

export interface ContractStats {
  total_contracts: number
  total_value_ht: number
  total_value_ttc: number
  total_mrr: number
  active_contracts: number
}

export async function getContractStats(commercialId?: string): Promise<ContractStats> {
  const contracts = await getContracts(commercialId)

  return {
    total_contracts: contracts.length,
    total_value_ht: contracts.reduce((sum, c) => sum + c.amount_ht, 0),
    total_value_ttc: contracts.reduce((sum, c) => sum + c.amount_ttc, 0),
    total_mrr: contracts.reduce((sum, c) => sum + (c.monthly_amount ?? 0), 0),
    active_contracts: contracts.filter(c => c.status === 'en_cours' || c.status === 'onboarding').length,
  }
}
