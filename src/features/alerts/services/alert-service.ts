import { supabase } from '@/lib/supabase/client'
import type { SmartAlert } from '@/types'

export async function getSmartAlerts(commercialId?: string): Promise<SmartAlert[]> {
  const alerts: SmartAlert[] = []
  const now = new Date()

  // 1. Prospect chaud non relance (interesse/rdv_pris sans rappel, last_called_at > 48h)
  let hotQuery = supabase
    .from('prospects')
    .select('id, company_name, commercial_id, last_called_at, status, next_reminder_at')
    .in('status', ['site_en_attente', 'site_envoye', 'rdv_pris', 'a_rappeler'])
    .is('deleted_at', null)

  if (commercialId) {
    hotQuery = hotQuery.eq('commercial_id', commercialId)
  }

  const { data: hotProspects } = await hotQuery
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()

  for (const p of (hotProspects ?? []) as { id: string; company_name: string; commercial_id: string; last_called_at: string | null; status: string; next_reminder_at: string | null }[]) {
    const lastContact = p.last_called_at ?? ''
    const hasUpcomingReminder = p.next_reminder_at && new Date(p.next_reminder_at) > now

    if (lastContact && lastContact < twoDaysAgo && !hasUpcomingReminder) {
      alerts.push({
        id: `hot-${p.id}`,
        type: 'prospect_chaud_non_relance',
        title: 'Prospect chaud non relancé',
        message: `${p.company_name} (${p.status}) n'a pas été contacté depuis +48h`,
        severity: 'critical',
        entity_type: 'prospect',
        entity_id: p.id,
        commercial_id: p.commercial_id,
        is_dismissed: false,
        created_at: now.toISOString(),
        link: `/prospects/${p.id}`,
      })
    }
  }

  // 2. Devis sans reponse > 3 jours
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
  let devisQuery = supabase
    .from('devis')
    .select('id, reference, sent_at, client:clients!devis_client_id_fkey(id, company_name, commercial_id)')
    .eq('status', 'envoye')
    .is('deleted_at', null)
    .lt('sent_at', threeDaysAgo)

  const { data: pendingDevis } = await devisQuery

  for (const d of (pendingDevis ?? []) as unknown as { id: string; reference: string; sent_at: string; client?: { id: string; company_name: string; commercial_id: string } }[]) {
    if (commercialId && d.client?.commercial_id !== commercialId) continue
    alerts.push({
      id: `devis-${d.id}`,
      type: 'devis_sans_reponse',
      title: 'Devis sans réponse',
      message: `${d.reference} pour ${d.client?.company_name ?? 'Inconnu'} envoyé il y a +3 jours`,
      severity: 'warning',
      entity_type: 'devis',
      entity_id: d.id,
      commercial_id: d.client?.commercial_id ?? null,
      is_dismissed: false,
      created_at: now.toISOString(),
      link: `/clients/${d.client?.id}`,
    })
  }

  // 3. Rappels en retard
  let reminderQuery = supabase
    .from('reminders')
    .select('id, remind_at, prospect:prospects!reminders_prospect_id_fkey(id, company_name)')
    .eq('is_completed', false)
    .lt('remind_at', now.toISOString())

  if (commercialId) {
    reminderQuery = reminderQuery.eq('commercial_id', commercialId)
  }

  const { data: overdueReminders } = await reminderQuery

  for (const r of (overdueReminders ?? []) as unknown as { id: string; remind_at: string; prospect?: { id: string; company_name: string } }[]) {
    alerts.push({
      id: `reminder-${r.id}`,
      type: 'rappel_en_retard',
      title: 'Rappel en retard',
      message: `Rappel pour ${r.prospect?.company_name ?? 'Inconnu'} en retard`,
      severity: 'warning',
      entity_type: 'reminder',
      entity_id: r.id,
      commercial_id: commercialId ?? null,
      is_dismissed: false,
      created_at: now.toISOString(),
      link: `/prospects/${r.prospect?.id}`,
    })
  }

  // 4. Prospects sans action planifiee
  let noActionQuery = supabase
    .from('prospects')
    .select('id, company_name, commercial_id, status, next_reminder_at')
    .not('status', 'in', '("perdu","converti_client","negatif","nouveau")')
    .is('next_reminder_at', null)
    .is('deleted_at', null)

  if (commercialId) {
    noActionQuery = noActionQuery.eq('commercial_id', commercialId)
  }

  const { data: noActionProspects } = await noActionQuery

  for (const p of (noActionProspects ?? []) as { id: string; company_name: string; commercial_id: string; status: string }[]) {
    alerts.push({
      id: `no-action-${p.id}`,
      type: 'prospect_sans_action',
      title: 'Prospect sans action planifiée',
      message: `${p.company_name} n'a aucune action prévue`,
      severity: 'info',
      entity_type: 'prospect',
      entity_id: p.id,
      commercial_id: p.commercial_id,
      is_dismissed: false,
      created_at: now.toISOString(),
      link: `/prospects/${p.id}`,
    })
  }

  // 5. Client proche renouvellement (projects ending within 30 days)
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
  let renewalQuery = supabase
    .from('projects')
    .select('id, name, end_date, client:clients!projects_client_id_fkey(id, company_name, commercial_id)')
    .eq('status', 'en_cours')
    .is('deleted_at', null)
    .not('end_date', 'is', null)
    .lte('end_date', thirtyDaysFromNow)
    .gte('end_date', now.toISOString())

  const { data: renewalProjects } = await renewalQuery

  for (const p of (renewalProjects ?? []) as unknown as { id: string; name: string; end_date: string; client?: { id: string; company_name: string; commercial_id: string } }[]) {
    if (commercialId && p.client?.commercial_id !== commercialId) continue
    alerts.push({
      id: `renewal-${p.id}`,
      type: 'client_renouvellement',
      title: 'Client proche renouvellement',
      message: `Projet "${p.name}" de ${p.client?.company_name ?? 'Inconnu'} termine bientôt`,
      severity: 'info',
      entity_type: 'project',
      entity_id: p.id,
      commercial_id: p.client?.commercial_id ?? null,
      is_dismissed: false,
      created_at: now.toISOString(),
      link: `/clients/${p.client?.id}`,
    })
  }

  // Sort by severity
  const severityOrder = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
}
