import { supabase } from '@/lib/supabase/client'
import type { RendezVous, Reminder } from '@/types'

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string | null
  type: 'rdv' | 'reminder' | 'task'
  status: string
  prospectId: string | null
  prospectName: string | null
  color: string
  meta?: Record<string, unknown>
}

export async function getCalendarEvents(
  startDate: string,
  endDate: string,
  commercialId?: string
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = []

  // Fetch RDVs
  let rdvQuery = supabase
    .from('rendez_vous')
    .select('*, prospect:prospects!rendez_vous_prospect_id_fkey(id, company_name)')
    .is('deleted_at', null)
    .gte('scheduled_at', startDate)
    .lte('scheduled_at', endDate)

  if (commercialId) {
    rdvQuery = rdvQuery.eq('commercial_id', commercialId)
  }

  const { data: rdvs, error: rdvError } = await rdvQuery

  if (!rdvError && rdvs) {
    for (const rdv of rdvs as unknown as RendezVous[]) {
      const endTime = new Date(rdv.scheduled_at)
      endTime.setMinutes(endTime.getMinutes() + (rdv.duration_minutes || 30))
      events.push({
        id: `rdv-${rdv.id}`,
        title: `RDV: ${rdv.prospect?.company_name ?? 'Inconnu'}`,
        start: rdv.scheduled_at,
        end: endTime.toISOString(),
        type: 'rdv',
        status: rdv.status,
        prospectId: rdv.prospect_id,
        prospectName: rdv.prospect?.company_name ?? null,
        color: rdv.status === 'fait' ? '#10B981' : rdv.status === 'annule' ? '#6B7280' : rdv.status === 'no_show' ? '#EF4444' : '#3B82F6',
      })
    }
  }

  // Fetch Reminders
  let reminderQuery = supabase
    .from('reminders')
    .select('*, prospect:prospects!reminders_prospect_id_fkey(id, company_name)')
    .eq('is_completed', false)
    .gte('remind_at', startDate)
    .lte('remind_at', endDate)

  if (commercialId) {
    reminderQuery = reminderQuery.eq('commercial_id', commercialId)
  }

  const { data: reminders, error: reminderError } = await reminderQuery

  if (!reminderError && reminders) {
    for (const r of reminders as unknown as Reminder[]) {
      events.push({
        id: `reminder-${r.id}`,
        title: `Rappel: ${r.prospect?.company_name ?? 'Inconnu'}`,
        start: r.remind_at,
        end: null,
        type: 'reminder',
        status: r.is_completed ? 'completed' : 'pending',
        prospectId: r.prospect_id,
        prospectName: r.prospect?.company_name ?? null,
        color: '#F59E0B',
        meta: { note: r.note },
      })
    }
  }

  return events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
}
