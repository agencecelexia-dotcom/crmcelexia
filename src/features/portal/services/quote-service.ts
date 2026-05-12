import { supabase } from '@/lib/supabase/client'
import type { Quote, QuoteItem, QuoteItemLibrary, QuoteSettings, QuoteStatus } from '@/types'

const BUCKET = 'portal-quotes'

// ──────────────────────────────────────────────────────────
// quote_settings
// ──────────────────────────────────────────────────────────

export async function getQuoteSettings(clientId: string): Promise<QuoteSettings | null> {
  const { data, error } = await supabase
    .from('quote_settings')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as QuoteSettings | null
}

export async function upsertQuoteSettings(
  clientId: string,
  updates: Partial<Omit<QuoteSettings, 'client_id' | 'created_at' | 'updated_at'>>,
): Promise<QuoteSettings> {
  const payload = { client_id: clientId, ...updates }
  const { data, error } = await supabase
    .from('quote_settings')
    .upsert(payload, { onConflict: 'client_id' })
    .select()
    .single()
  if (error) throw error
  return data as QuoteSettings
}

export async function uploadQuoteLogo(clientId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${clientId}/logo-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || undefined,
  })
  if (error) throw error
  return path
}

export async function getQuoteLogoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl ?? null
}

// ──────────────────────────────────────────────────────────
// quotes
// ──────────────────────────────────────────────────────────

export async function listQuotes(clientId: string, status?: QuoteStatus): Promise<Quote[]> {
  let q = supabase
    .from('quotes')
    .select('*, portal_lead:portal_leads(id, name)')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Quote[]
}

export async function getQuoteWithItems(id: string): Promise<Quote> {
  const { data: quote, error: qErr } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (qErr) throw qErr
  const { data: items, error: iErr } = await supabase
    .from('quote_items')
    .select('*')
    .eq('quote_id', id)
    .order('position', { ascending: true })
  if (iErr) throw iErr
  return { ...(quote as Quote), items: (items ?? []) as QuoteItem[] }
}

export interface CreateQuoteInput {
  client_id: string
  portal_lead_id?: string | null
  recipient_name: string
  recipient_address?: string | null
  recipient_postal_code?: string | null
  recipient_city?: string | null
  recipient_phone?: string | null
  recipient_email?: string | null
  issued_at?: string
  valid_until: string
  internal_notes?: string | null
  client_message?: string | null
  payment_terms?: string | null
  footer_notes?: string | null
}

export async function createQuote(input: CreateQuoteInput): Promise<Quote> {
  const { data, error } = await supabase
    .from('quotes')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as Quote
}

export async function updateQuote(id: string, updates: Partial<Quote>): Promise<Quote> {
  // strip readonly/computed fields
  const { id: _id, client_id: _cid, quote_number: _qn, total_ht, total_tva, total_ttc, created_at, updated_at, items, ...rest } = updates as Quote & {
    items?: QuoteItem[]
  }
  void _id; void _cid; void _qn; void total_ht; void total_tva; void total_ttc; void created_at; void updated_at; void items
  const { data, error } = await supabase
    .from('quotes')
    .update(rest)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Quote
}

export async function softDeleteQuote(id: string): Promise<void> {
  // RPC SECURITY DEFINER (00093) — l'UPDATE direct sur deleted_at
  // échouait avec une erreur RLS opaque sur la NEW row. Le RPC
  // vérifie l'ownership (et refuse les devis signés).
  const { error } = await supabase.rpc('soft_delete_quote', { quote_id: id })
  if (error) throw error
}

export interface ReplaceItemInput {
  position: number
  description: string
  quantity: number
  unit: string
  unit_price_ht: number
  vat_rate: number
}

export async function replaceQuoteItems(
  quoteId: string,
  items: ReplaceItemInput[],
): Promise<void> {
  // DELETE all items first (trigger will recompute totals)
  const { error: delErr } = await supabase
    .from('quote_items')
    .delete()
    .eq('quote_id', quoteId)
  if (delErr) throw delErr
  if (items.length === 0) return
  // INSERT en série pour conserver l'ordre des positions
  for (const item of items) {
    const { error } = await supabase
      .from('quote_items')
      .insert({ quote_id: quoteId, ...item })
    if (error) throw error
  }
}

// ──────────────────────────────────────────────────────────
// quote_item_library
// ──────────────────────────────────────────────────────────

export async function listLibrary(clientId: string): Promise<QuoteItemLibrary[]> {
  const { data, error } = await supabase
    .from('quote_item_library')
    .select('*')
    .eq('client_id', clientId)
    .order('usage_count', { ascending: false })
    .order('label', { ascending: true })
  if (error) throw error
  return (data ?? []) as QuoteItemLibrary[]
}

export interface AddLibraryInput {
  label: string
  description?: string | null
  default_unit?: string
  default_unit_price_ht?: number
  default_vat_rate?: number
}

export async function addToLibrary(
  clientId: string,
  item: AddLibraryInput,
): Promise<QuoteItemLibrary> {
  const { data, error } = await supabase
    .from('quote_item_library')
    .insert({ client_id: clientId, ...item })
    .select()
    .single()
  if (error) throw error
  return data as QuoteItemLibrary
}

export async function removeFromLibrary(id: string): Promise<void> {
  const { error } = await supabase
    .from('quote_item_library')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function incrementLibraryUsage(id: string): Promise<void> {
  const { data, error: gErr } = await supabase
    .from('quote_item_library')
    .select('usage_count')
    .eq('id', id)
    .single()
  if (gErr) return
  const current = (data?.usage_count as number) ?? 0
  await supabase
    .from('quote_item_library')
    .update({ usage_count: current + 1 })
    .eq('id', id)
}
