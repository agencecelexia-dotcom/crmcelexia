import { supabase } from '@/lib/supabase/client'

// ── Commission types ──
export interface Commission {
  id: string
  client_id: string
  opportunity_id: string | null
  month: string // DATE as string (YYYY-MM-DD)
  revenue_generated: number
  commission_rate: number
  commission_amount: number // generated column
  status: 'a_recevoir' | 'recu' | 'en_retard'
  paid_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ── Budget Payment types ──
export interface BudgetPayment {
  id: string
  client_id: string
  opportunity_id: string | null
  amount: number
  payment_date: string // DATE
  notes: string | null
  created_at: string
}

// ── Invoice types ──
export interface Invoice {
  id: string
  client_id: string
  uploaded_by: string
  file_name: string
  file_path: string
  file_size: number
  amount: number
  invoice_date: string // DATE
  type: 'commission' | 'budget_pub'
  notes: string | null
  created_at: string
  deleted_at: string | null
}

// ── Commissions ──
export async function getCommissionsForClient(clientId: string): Promise<Commission[]> {
  const { data, error } = await supabase
    .from('commissions')
    .select('*')
    .eq('client_id', clientId)
    .order('month', { ascending: false })

  if (error) throw error
  return (data ?? []) as Commission[]
}

export async function createCommission(params: {
  client_id: string
  opportunity_id?: string | null
  month: string
  revenue_generated: number
  commission_rate?: number
  notes?: string | null
}): Promise<Commission> {
  const { data, error } = await supabase
    .from('commissions')
    .insert({
      client_id: params.client_id,
      opportunity_id: params.opportunity_id ?? null,
      month: params.month,
      revenue_generated: params.revenue_generated,
      commission_rate: params.commission_rate ?? 0.10,
      notes: params.notes ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as Commission
}

export async function updateCommissionStatus(
  id: string,
  status: Commission['status'],
): Promise<void> {
  const updates: Record<string, unknown> = { status }
  if (status === 'recu') {
    updates.paid_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('commissions')
    .update(updates)
    .eq('id', id)

  if (error) throw error
}

// ── Budget Payments ──
export async function getBudgetPaymentsForClient(clientId: string): Promise<BudgetPayment[]> {
  const { data, error } = await supabase
    .from('budget_payments')
    .select('*')
    .eq('client_id', clientId)
    .order('payment_date', { ascending: false })

  if (error) throw error
  return (data ?? []) as BudgetPayment[]
}

export async function createBudgetPayment(params: {
  client_id: string
  opportunity_id?: string | null
  amount: number
  payment_date: string
  notes?: string | null
}): Promise<BudgetPayment> {
  const { data, error } = await supabase
    .from('budget_payments')
    .insert({
      client_id: params.client_id,
      opportunity_id: params.opportunity_id ?? null,
      amount: params.amount,
      payment_date: params.payment_date,
      notes: params.notes ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as BudgetPayment
}

// ── Invoices ──
export async function getInvoicesForClient(clientId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('invoice_date', { ascending: false })

  if (error) throw error
  return (data ?? []) as Invoice[]
}

export async function uploadInvoice(params: {
  clientId: string
  uploadedBy: string
  file: File
  amount: number
  invoiceDate: string
  type: 'commission' | 'budget_pub'
  notes?: string | null
}): Promise<Invoice> {
  const { clientId, uploadedBy, file, amount, invoiceDate, type, notes } = params

  // Upload file to Supabase Storage
  const filePath = `${clientId}/${Date.now()}_${file.name}`
  const { error: uploadError } = await supabase.storage
    .from('factures')
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) throw uploadError

  // Insert record in invoices table
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      client_id: clientId,
      uploaded_by: uploadedBy,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      amount,
      invoice_date: invoiceDate,
      type,
      notes: notes ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as Invoice
}

export async function softDeleteInvoice(id: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

export function getInvoicePublicUrl(filePath: string): string {
  const { data } = supabase.storage
    .from('factures')
    .getPublicUrl(filePath)

  return data.publicUrl
}
