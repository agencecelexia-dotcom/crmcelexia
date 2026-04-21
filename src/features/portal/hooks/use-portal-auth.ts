import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Profile, Client } from '@/types'

export interface PortalOnboarding {
  id: string
  client_id: string
  status: string
  contract_signed: boolean
  contract_signed_at: string | null
  payment_proof_uploaded: boolean
  payment_amount: number | null
  gmb_access_confirmed: boolean
  rc_pro_uploaded: boolean
  kbis_uploaded: boolean
  training_video_watched: boolean
  quiz_score: number | null
  quiz_completed_at: string | null
  validated_at: string | null
  current_step: number
  reminder_count: number
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
