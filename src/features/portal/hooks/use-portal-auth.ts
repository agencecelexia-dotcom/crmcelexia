import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Profile, Client } from '@/types'

export interface PortalOnboarding {
  id: string
  client_id: string
  status: string
  contract_signed: boolean
  contract_signed_at: string | null
  contract_signature_data: string | null
  contract_data: Record<string, string> | null
  signed_contract_path: string | null
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
  training_video_watched_at: string | null
  quiz_score: number | null
  quiz_answers: Record<string, unknown> | null
  quiz_completed_at: string | null
  validated_at: string | null
  validated_by: string | null
  rejection_reason: string | null
  current_step: number
  started_at: string
  last_activity_at: string
  last_reminder_sent_at: string | null
  reminder_count: number
  reminders_disabled: boolean
  completed_at: string | null
}

export interface PortalAuthContextType {
  session: Session | null
  profile: Profile | null
  client: Client | null
  onboarding: PortalOnboarding | null
  isLoading: boolean
  signOut: () => Promise<void>
  refreshOnboarding: () => Promise<void>
}

export const PortalAuthContext = createContext<PortalAuthContextType | undefined>(undefined)

export function usePortalAuth(): PortalAuthContextType {
  const ctx = useContext(PortalAuthContext)
  if (!ctx) throw new Error('usePortalAuth must be used within PortalAuthProvider')
  return ctx
}
