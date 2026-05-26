import { supabase } from '@/lib/supabase/client'

/**
 * Vue agrégée "à rappeler" — consolide les 3 sources de prospects à
 * relancer qui sont dispersées dans la DB :
 *
 * 1. `reminders` non complétés (table dédiée, alimentée par les call panels)
 * 2. `rendez_vous` avec `recall_status` IN (to_do, in_progress) — no-show
 *    et RDV annulés qui méritent une relance
 * 3. `prospects.next_reminder_at` dans le passé SANS reminder actif —
 *    les "fantômes" qu'on a oubliés
 *
 * Utilisé par la page /rappels pour donner une vue unique imprimable
 * où le fondateur voit toutes les opportunités à ré-ouvrir.
 */

export interface NoShowRdv {
  id: string
  prospect_id: string
  scheduled_at: string
  recall_status: string
  recall_attempts: number
  notes: string | null
  no_show_reason: string | null
  type: string
  prospect: {
    id: string
    company_name: string
    contact_firstname: string | null
    contact_name: string | null
    phone: string
    status: string
  } | null
}

export interface ForgottenProspect {
  id: string
  company_name: string
  contact_firstname: string | null
  contact_name: string | null
  phone: string
  city: string | null
  profession: string | null
  status: string
  next_reminder_at: string
  last_called_at: string | null
  notes: string | null
}

export async function getNoShowRdvsToRecall(): Promise<NoShowRdv[]> {
  const { data, error } = await supabase
    .from('rendez_vous')
    .select(`
      id, prospect_id, scheduled_at, recall_status, recall_attempts,
      notes, no_show_reason, type,
      prospect:prospects!rendez_vous_prospect_id_fkey(
        id, company_name, contact_firstname, contact_name, phone, status
      )
    `)
    .in('recall_status', ['to_do', 'in_progress'])
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as NoShowRdv[]
}

export async function getForgottenProspects(limit = 100): Promise<ForgottenProspect[]> {
  const now = new Date().toISOString()
  // Sous-requête : prospects où next_reminder_at < now ET pas de reminder actif
  // (sinon ils sont déjà dans la section reminders).
  // Postgres : on fait 2 calls (PostgREST ne supporte pas JOIN avec NOT EXISTS).
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, company_name, contact_firstname, contact_name, phone, city, profession, status, next_reminder_at, last_called_at, notes')
    .lt('next_reminder_at', now)
    .is('deleted_at', null)
    .order('next_reminder_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  if (!prospects || prospects.length === 0) return []

  // Filtre : on enlève ceux qui ont déjà un reminder actif
  const ids = prospects.map(p => p.id)
  const { data: activeReminders } = await supabase
    .from('reminders')
    .select('prospect_id')
    .in('prospect_id', ids)
    .eq('is_completed', false)
  const withActiveReminder = new Set((activeReminders ?? []).map(r => r.prospect_id))
  return prospects.filter(p => !withActiveReminder.has(p.id)) as ForgottenProspect[]
}
