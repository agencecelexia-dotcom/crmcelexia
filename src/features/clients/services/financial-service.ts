import { supabase } from '@/lib/supabase/client'

// ── Commission types ──
// Note : la table legacy `commissions` est dropée (migration 00100).
// Source de vérité = portal_leads.commission_* (migration 00096).
// Ce service expose une vue compatible avec l'ancienne UI admin.
export interface Commission {
  id: string                 // = portal_lead.id
  client_id: string
  opportunity_id: string | null
  month: string              // Premier jour du mois de signed_at (YYYY-MM-DD)
  revenue_generated: number  // = portal_lead.signed_amount
  commission_rate: number
  commission_amount: number
  status: 'a_recevoir' | 'recu' | 'en_retard'
  paid_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  /** Nom du lead (pour affichage UI à la place de "month"). */
  lead_name?: string
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

// ── Commissions (lecture seule, agrégation portal_leads) ──
//
// Mapping commission_status portail → status admin :
//   'paid'          → 'recu'        (commission encaissée)
//   'pending'       → 'a_recevoir'  (lead signé, l'artisan n'a pas encore payé)
//   'declared_paid' → 'a_recevoir'  (l'artisan a déclaré, en attente validation)
//   'disputed'      → 'en_retard'   (paiement contesté par Celexia)
export async function getCommissionsForClient(clientId: string): Promise<Commission[]> {
  const { data, error } = await supabase
    .from('portal_leads')
    .select('id, client_id, name, signed_amount, signed_at, commission_rate, commission_amount, commission_status, commission_paid_at, commission_admin_notes, created_at, updated_at')
    .eq('client_id', clientId)
    .eq('status', 'signe')
    .is('deleted_at', null)
    .order('signed_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((l): Commission => {
    const status: Commission['status'] =
      l.commission_status === 'paid' ? 'recu'
        : l.commission_status === 'disputed' ? 'en_retard'
          : 'a_recevoir'
    const signedDate = l.signed_at ? new Date(l.signed_at) : new Date(l.created_at)
    const monthStart = new Date(signedDate.getFullYear(), signedDate.getMonth(), 1)
    return {
      id: l.id,
      client_id: l.client_id,
      opportunity_id: null,
      month: monthStart.toISOString().slice(0, 10),
      revenue_generated: Number(l.signed_amount ?? 0),
      commission_rate: Number(l.commission_rate ?? 0),
      commission_amount: Number(l.commission_amount ?? 0),
      status,
      paid_at: l.commission_paid_at,
      notes: l.commission_admin_notes,
      created_at: l.created_at,
      updated_at: l.updated_at,
      lead_name: l.name,
    }
  })
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
