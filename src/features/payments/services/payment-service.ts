import { supabase } from '@/lib/supabase/client'
import type { Devis, Client } from '@/types'
import type { PaymentStatus } from '@/types/enums'

export interface PaymentView {
  id: string
  reference: string
  clientName: string
  clientId: string
  amount: number
  status: PaymentStatus
  due_date: string | null
  paid_date: string | null
  created_at: string
  devis_status: string
}

function derivePaymentStatus(devis: Devis): PaymentStatus {
  if (devis.status === 'signe') return 'paye'
  if (devis.status === 'refuse') return 'impaye'
  if (devis.status === 'expire') return 'impaye'
  if (devis.status === 'envoye') {
    if (devis.valid_until) {
      const validDate = new Date(devis.valid_until)
      const now = new Date()
      if (now > validDate) {
        const daysPastDue = Math.floor((now.getTime() - validDate.getTime()) / (1000 * 60 * 60 * 24))
        if (daysPastDue > 30) return 'impaye'
        return 'en_retard'
      }
    }
    if (devis.sent_at) {
      const sentDate = new Date(devis.sent_at)
      const daysSinceSent = Math.floor((Date.now() - sentDate.getTime()) / (1000 * 60 * 60 * 24))
      if (daysSinceSent > 30) return 'en_retard'
    }
    return 'en_attente'
  }
  return 'en_attente'
}

export async function getPayments(filters?: {
  status?: PaymentStatus[]
  commercialId?: string
}): Promise<PaymentView[]> {
  let query = supabase
    .from('devis')
    .select('*, client:clients!devis_client_id_fkey(id, company_name, commercial_id)')
    .is('deleted_at', null)
    .not('status', 'eq', 'brouillon')
    .order('created_at', { ascending: false })

  const { data, error } = await query

  if (error) throw error

  let payments = ((data ?? []) as unknown as (Devis & { client?: Client })[]).map((d) => ({
    id: d.id,
    reference: d.reference,
    clientName: d.client?.company_name ?? 'Inconnu',
    clientId: d.client_id,
    amount: d.amount_ttc,
    status: derivePaymentStatus(d),
    due_date: d.valid_until,
    paid_date: d.signed_at,
    created_at: d.created_at,
    devis_status: d.status,
  }))

  if (filters?.commercialId) {
    const commercialClients = ((data ?? []) as unknown as (Devis & { client?: Client })[])
      .filter(d => d.client?.commercial_id === filters.commercialId)
      .map(d => d.id)
    payments = payments.filter(p => commercialClients.includes(p.id))
  }

  if (filters?.status && filters.status.length > 0) {
    payments = payments.filter(p => filters.status!.includes(p.status))
  }

  return payments
}

export interface PaymentStats {
  total_paye: number
  total_en_attente: number
  total_en_retard: number
  total_impaye: number
  count_paye: number
  count_en_attente: number
  count_en_retard: number
  count_impaye: number
}

export async function getPaymentStats(commercialId?: string): Promise<PaymentStats> {
  const payments = await getPayments({ commercialId })

  const calc = (status: PaymentStatus) => ({
    total: payments.filter(p => p.status === status).reduce((sum, p) => sum + p.amount, 0),
    count: payments.filter(p => p.status === status).length,
  })

  const paye = calc('paye')
  const enAttente = calc('en_attente')
  const enRetard = calc('en_retard')
  const impaye = calc('impaye')

  return {
    total_paye: paye.total,
    total_en_attente: enAttente.total,
    total_en_retard: enRetard.total,
    total_impaye: impaye.total,
    count_paye: paye.count,
    count_en_attente: enAttente.count,
    count_en_retard: enRetard.count,
    count_impaye: impaye.count,
  }
}
