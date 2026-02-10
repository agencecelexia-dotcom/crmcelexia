import { supabase } from '@/lib/supabase/client'
import type { Reminder } from '@/types'

interface CreateReminderParams {
  prospect_id: string
  commercial_id: string
  remind_at: string
  note?: string | null
}

export async function createReminder(params: CreateReminderParams): Promise<Reminder> {
  const { data, error } = await supabase
    .from('reminders')
    .insert(params)
    .select('*, prospect:prospects!reminders_prospect_id_fkey(id, company_name, phone)')
    .single()

  if (error) throw error
  return data as unknown as Reminder
}

export async function getRemindersForProspect(prospectId: string): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('remind_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as Reminder[]
}

export async function getMyReminders(commercialId: string, options?: {
  todayOnly?: boolean
  overdueOnly?: boolean
  includeCompleted?: boolean
}): Promise<Reminder[]> {
  let query = supabase
    .from('reminders')
    .select('*, prospect:prospects!reminders_prospect_id_fkey(id, company_name, phone, status)')
    .eq('commercial_id', commercialId)

  if (!options?.includeCompleted) {
    query = query.eq('is_completed', false)
  }

  if (options?.todayOnly) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    query = query
      .gte('remind_at', today.toISOString())
      .lt('remind_at', tomorrow.toISOString())
  }

  if (options?.overdueOnly) {
    query = query.lt('remind_at', new Date().toISOString())
  }

  const { data, error } = await query.order('remind_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as Reminder[]
}

export async function completeReminder(id: string): Promise<Reminder> {
  const { data, error } = await supabase
    .from('reminders')
    .update({
      is_completed: true,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Reminder
}
