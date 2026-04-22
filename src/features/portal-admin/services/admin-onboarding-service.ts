import { supabase } from '@/lib/supabase/client'

export interface AdminOnboardingRow {
  id: string
  client_id: string
  status: string
  contract_signed: boolean
  contract_signed_at: string | null
  payment_proof_uploaded: boolean
  payment_proof_path: string | null
  payment_amount: number | null
  gmb_access_confirmed: boolean
  gmb_confirmed_at: string | null
  rc_pro_uploaded: boolean
  rc_pro_path: string | null
  kbis_uploaded: boolean
  kbis_path: string | null
  training_video_watched: boolean
  quiz_score: number | null
  quiz_completed_at: string | null
  signed_contract_path: string | null
  validated_at: string | null
  validated_by: string | null
  rejection_reason: string | null
  reminder_count: number
  reminders_disabled: boolean
  current_step: number
  created_at: string
  updated_at: string
  completed_at: string | null
  // Joined
  client: {
    id: string
    company_name: string
    contact_firstname: string | null
    contact_name: string | null
    contact_email: string | null
    phone: string
    city: string | null
    profession: string | null
  }
}

const SELECT = `*, client:clients!portal_onboardings_client_id_fkey(id, company_name, contact_firstname, contact_name, contact_email, phone, city, profession)`

export async function getPendingOnboardings(): Promise<AdminOnboardingRow[]> {
  const { data, error } = await supabase
    .from('portal_onboardings')
    .select(SELECT)
    .in('status', ['in_progress', 'pending_validation'])
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as AdminOnboardingRow[]
}

export async function getAllOnboardings(): Promise<AdminOnboardingRow[]> {
  const { data, error } = await supabase
    .from('portal_onboardings')
    .select(SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as AdminOnboardingRow[]
}

export async function validateOnboarding(onboardingId: string, validatedBy: string) {
  const { error } = await supabase
    .from('portal_onboardings')
    .update({
      status: 'validated',
      validated_at: new Date().toISOString(),
      validated_by: validatedBy,
    })
    .eq('id', onboardingId)
  if (error) throw error
}

export async function rejectOnboarding(onboardingId: string, reason: string) {
  const { error } = await supabase
    .from('portal_onboardings')
    .update({
      status: 'in_progress',
      rejection_reason: reason,
      completed_at: null,
    })
    .eq('id', onboardingId)
  if (error) throw error
}

export async function toggleReminders(onboardingId: string, disabled: boolean) {
  const { error } = await supabase
    .from('portal_onboardings')
    .update({ reminders_disabled: disabled })
    .eq('id', onboardingId)
  if (error) throw error
}
