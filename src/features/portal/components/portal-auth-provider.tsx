import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Session } from '@supabase/supabase-js'
import type { Profile, Client } from '@/types'
import { PortalAuthContext, type PortalOnboarding } from '../hooks/use-portal-auth'

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [onboarding, setOnboarding] = useState<PortalOnboarding | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchPortalData = useCallback(async (userId: string) => {
    // Fetch profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(profileData as Profile | null)

    if (!profileData || profileData.role !== 'artisan') {
      setIsLoading(false)
      return
    }

    // Fetch client linked to this user
    const { data: clientData } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', userId)
      .single()
    setClient(clientData as Client | null)

    // Fetch onboarding
    if (clientData) {
      const { data: onbData } = await supabase
        .from('portal_onboardings')
        .select('*')
        .eq('client_id', clientData.id)
        .single()
      setOnboarding(onbData as PortalOnboarding | null)
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (s?.user) fetchPortalData(s.user.id)
      else setIsLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s?.user) fetchPortalData(s.user.id)
      else {
        setProfile(null)
        setClient(null)
        setOnboarding(null)
        setIsLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchPortalData])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setClient(null)
    setOnboarding(null)
  }, [])

  const refreshOnboarding = useCallback(async () => {
    if (!client) return
    const { data } = await supabase
      .from('portal_onboardings')
      .select('*')
      .eq('client_id', client.id)
      .single()
    setOnboarding(data as PortalOnboarding | null)
  }, [client])

  return (
    <PortalAuthContext.Provider value={{ session, profile, client, onboarding, isLoading, signOut, refreshOnboarding }}>
      {children}
    </PortalAuthContext.Provider>
  )
}
