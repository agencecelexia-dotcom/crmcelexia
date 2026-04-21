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

  // Log event
  await supabase.from('portal_lead_events').insert({
    portal_lead_id: data.id,
    event_type: 'created',
    description: `Lead "${lead.name}" créé`,
    new_status: 'nouveau',
  })

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
  const { error } = await supabase
    .from('portal_leads')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
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
    .select('status, signed_amount, commission_amount, created_at')
    .eq('client_id', clientId)
    .is('deleted_at', null)
  if (error) throw error

  const leads = data ?? []
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const thisMonth = leads.filter(l => new Date(l.created_at) >= monthStart)
  const signed = leads.filter(l => l.status === 'signe')
  const signedThisMonth = signed.filter(l => new Date(l.created_at) >= monthStart)

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
  }
}
