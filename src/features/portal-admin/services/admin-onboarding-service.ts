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

/** Fetch l'onboarding portail d'un client donné (pour l'admin / la page client). */
export async function getOnboardingByClientId(clientId: string): Promise<AdminOnboardingRow | null> {
  const { data, error } = await supabase
    .from('portal_onboardings')
    .select(SELECT)
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as unknown as AdminOnboardingRow | null
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

export type OnboardingStepKey =
  | 'contract'
  | 'payment'
  | 'gmb'
  | 'rc_pro'
  | 'kbis'
  | 'training'

export async function rejectOnboarding(
  onboardingId: string,
  reason: string,
  stepsToReset: OnboardingStepKey[],
) {
  const updates: Record<string, unknown> = {
    status: 'in_progress',
    rejection_reason: reason,
    completed_at: null,
  }

  if (stepsToReset.includes('contract')) {
    updates.contract_signed = false
    updates.contract_signed_at = null
    updates.signed_contract_path = null
  }
  if (stepsToReset.includes('payment')) {
    updates.payment_proof_uploaded = false
    updates.payment_proof_path = null
  }
  if (stepsToReset.includes('gmb')) {
    updates.gmb_access_confirmed = false
    updates.gmb_confirmed_at = null
  }
  if (stepsToReset.includes('rc_pro')) {
    updates.rc_pro_uploaded = false
    updates.rc_pro_path = null
  }
  if (stepsToReset.includes('kbis')) {
    updates.kbis_uploaded = false
    updates.kbis_path = null
  }
  if (stepsToReset.includes('training')) {
    updates.training_video_watched = false
    updates.training_video_watched_at = null
    updates.quiz_score = null
    updates.quiz_completed_at = null
  }

  const { error } = await supabase
    .from('portal_onboardings')
    .update(updates)
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
