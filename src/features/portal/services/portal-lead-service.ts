import { supabase } from '@/lib/supabase/client'
import type { PortalLead, PortalLeadEvent } from '@/types'

export async function getPortalLeads(clientId: string): Promise<PortalLead[]> {
  const { data, error } = await supabase
    .from('portal_leads')
    .select('*')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PortalLead[]
}

export async function getPortalLead(id: string): Promise<PortalLead> {
  const { data, error } = await supabase
    .from('portal_leads')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as PortalLead
}

export async function createPortalLead(lead: {
  client_id: string
  name: string
  phone: string
  work_type: string
  email?: string
  address?: string
  postal_code?: string
  city?: string
  amount_estimated?: number
  source?: 'lsa' | 'bao'
  notes?: string
}): Promise<PortalLead> {
  const { data, error } = await supabase
    .from('portal_leads')
    .insert(lead)
    .select()
    .single()
  if (error) throw error

  // L'event "created" est désormais inséré atomiquement par le trigger DB
  // trg_portal_lead_created_event (migration 00085). Plus de double-call
  // qui pouvait laisser un lead sans historique si le 2e échouait.

  return data as PortalLead
}

export async function updatePortalLeadStatus(
  id: string,
  newStatus: string,
  oldStatus: string,
  extra?: Partial<PortalLead>,
): Promise<PortalLead> {
  const updates: Record<string, unknown> = { status: newStatus, ...extra }
  const { data, error } = await supabase
    .from('portal_leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error

  // Log event
  const eventType = newStatus === 'signe' ? 'signed' : newStatus === 'perdu' ? 'lost' : 'status_change'
  await supabase.from('portal_lead_events').insert({
    portal_lead_id: id,
    event_type: eventType,
    description: `Statut changé de "${oldStatus}" à "${newStatus}"`,
    old_status: oldStatus,
    new_status: newStatus,
  })

  return data as PortalLead
}

export async function updatePortalLead(id: string, updates: Partial<PortalLead>): Promise<PortalLead> {
  const { data, error } = await supabase
    .from('portal_leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as PortalLead
}

export async function deletePortalLead(id: string): Promise<void> {
  // Passe par le RPC SECURITY DEFINER (00093) — l'UPDATE direct sur
  // deleted_at échouait avec une erreur RLS opaque malgré des policies
  // qui évaluaient à TRUE en test manuel. Le RPC vérifie l'ownership.
  const { error } = await supabase.rpc('soft_delete_portal_lead', { lead_id: id })
  if (error) throw error
}

// ──────────────────────────────────────────────────────────
// Commission payment tracking (migration 00096)
// ──────────────────────────────────────────────────────────

/** Artisan déclare avoir payé sa commission à Celexia → email auto agence. */
export async function declareCommissionPaid(leadId: string): Promise<void> {
  const { error } = await supabase.rpc('declare_commission_paid', { lead_id: leadId })
  if (error) throw error
}

/** Fondateur Celexia valide (ou refuse) un paiement de commission déclaré. */
export async function validateCommissionPayment(
  leadId: string,
  approved: boolean,
  notes?: string,
): Promise<void> {
  const { error } = await supabase.rpc('validate_commission_payment', {
    lead_id: leadId, approved, notes: notes ?? null,
  })
  if (error) throw error
}

export async function getPortalLeadEvents(leadId: string): Promise<PortalLeadEvent[]> {
  const { data, error } = await supabase
    .from('portal_lead_events')
    .select('*')
    .eq('portal_lead_id', leadId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PortalLeadEvent[]
}

export async function getPortalLeadStats(clientId: string) {
  const { data, error } = await supabase
    .from('portal_leads')
    .select('status, signed_amount, commission_amount, commission_status, created_at')
    .eq('client_id', clientId)
    .is('deleted_at', null)
  if (error) throw error

  const leads = data ?? []
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const thisMonth = leads.filter(l => new Date(l.created_at) >= monthStart)
  const signed = leads.filter(l => l.status === 'signe')
  const signedThisMonth = signed.filter(l => new Date(l.created_at) >= monthStart)

  // "Reste à payer" = signed ce mois dont la commission n'est pas
  // encore payée/validée (les statuts pending et disputed sont à
  // (re)payer, declared_paid + paid ne le sont plus).
  const stillToPayThisMonth = signedThisMonth.filter(
    l => l.commission_status === 'pending' || l.commission_status === 'disputed',
  )

  return {
    total_leads: leads.length,
    leads_this_month: thisMonth.length,
    devis_envoyes: leads.filter(l => l.status === 'devis').length,
    signed_count: signed.length,
    signed_this_month: signedThisMonth.length,
    total_ca: signed.reduce((s, l) => s + (l.signed_amount || 0), 0),
    total_commission: signed.reduce((s, l) => s + (l.commission_amount || 0), 0),
    ca_this_month: signedThisMonth.reduce((s, l) => s + (l.signed_amount || 0), 0),
    commission_this_month: signedThisMonth.reduce((s, l) => s + (l.commission_amount || 0), 0),
    /** Reste à payer ce mois (exclut les commissions déjà déclarées payées ou validées). */
    commission_remaining_this_month: stillToPayThisMonth.reduce((s, l) => s + (l.commission_amount || 0), 0),
  }
}
