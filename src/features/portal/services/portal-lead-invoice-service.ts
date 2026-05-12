import { supabase } from '@/lib/supabase/client'
import type { PortalLeadInvoice } from '@/types'

const BUCKET = 'portal-quotes'
const UPLOAD_TIMEOUT_MS = 60_000

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout après ${ms / 1000}s`)), ms),
    ),
  ])
}

function sanitizeFileName(name: string): string {
  const lastDot = name.lastIndexOf('.')
  const base = lastDot > 0 ? name.slice(0, lastDot) : name
  const ext = lastDot > 0 ? name.slice(lastDot) : ''
  const safeBase = base
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120)
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10)
  return safeBase + safeExt
}

export async function listLeadInvoices(leadId: string): Promise<PortalLeadInvoice[]> {
  const { data, error } = await supabase
    .from('portal_lead_invoices')
    .select('*')
    .eq('portal_lead_id', leadId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PortalLeadInvoice[]
}

export interface UploadLeadInvoiceInput {
  leadId: string
  clientId: string
  file: File
  invoiceType: 'acompte' | 'solde' | 'finale'
  amountTtc?: number | null
}

export async function uploadLeadInvoice(input: UploadLeadInvoiceInput): Promise<PortalLeadInvoice> {
  const safeName = sanitizeFileName(input.file.name)
  const path = `${input.clientId}/lead-invoices/${input.leadId}/${Date.now()}-${safeName}`
  const upload = await withTimeout(
    supabase.storage.from(BUCKET).upload(path, input.file, {
      cacheControl: '3600',
      upsert: false,
      contentType: input.file.type || 'application/octet-stream',
    }),
    UPLOAD_TIMEOUT_MS,
    'Upload facture',
  )
  if (upload.error) throw upload.error

  const { data, error } = await supabase
    .from('portal_lead_invoices')
    .insert({
      portal_lead_id: input.leadId,
      client_id: input.clientId,
      file_path: path,
      file_name: input.file.name,
      invoice_type: input.invoiceType,
      amount_ttc: input.amountTtc ?? null,
    })
    .select()
    .single()
  if (error) {
    // Rollback : on tente de retirer le fichier orphelin du storage.
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }
  return data as PortalLeadInvoice
}

export async function getLeadInvoiceUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl ?? null
}

export async function deleteLeadInvoice(id: string): Promise<void> {
  const { error } = await supabase.rpc('soft_delete_lead_invoice', { invoice_id: id })
  if (error) throw error
}
