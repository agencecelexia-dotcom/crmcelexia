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
    try {
      // Fetch profile
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (profileErr) console.error('[portal] profile fetch:', profileErr)
      setProfile(profileData as Profile | null)

      if (!profileData) return

      // Mode "view as" : un fondateur ou co-fondateur peut visualiser le portail
      // d'un artisan en passant ?as_client=<id> en URL. Permis seulement si is_founder.
      // On stocke l'id en sessionStorage pour le préserver à travers les <Navigate>
      // qui font perdre les query params (sinon l'utilisateur se retrouve éjecté).
      const params = new URLSearchParams(window.location.search)
      const asClientFromUrl = params.get('as_client')
      const isFounder = profileData.role === 'fondateur' || profileData.role === 'co_fondateur'

      if (asClientFromUrl && isFounder) {
        try { sessionStorage.setItem('portal_view_as_client', asClientFromUrl) } catch { /* noop */ }
      }
      const asClientId = asClientFromUrl
        || (isFounder ? (() => { try { return sessionStorage.getItem('portal_view_as_client') } catch { return null } })() : null)

      if (asClientId && isFounder) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('*')
          .eq('id', asClientId)
          .is('deleted_at', null)
          .maybeSingle()
        setClient(clientData as Client | null)
        if (clientData) {
          const { data: onbData } = await supabase
            .from('portal_onboardings')
            .select('*')
            .eq('client_id', (clientData as Client).id)
            .maybeSingle()
          setOnboarding(onbData as PortalOnboarding | null)
        }
        return
      }

      if (profileData.role !== 'artisan') return

      // Fetch client linked to this user
      const { data: clientData, error: clientErr } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (clientErr) console.error('[portal] client fetch:', clientErr)
      setClient(clientData as Client | null)

      // Fetch onboarding
      if (clientData) {
        const { data: onbData, error: onbErr } = await supabase
          .from('portal_onboardings')
          .select('*')
          .eq('client_id', (clientData as Client).id)
          .maybeSingle()
        if (onbErr) console.error('[portal] onboarding fetch:', onbErr)
        setOnboarding(onbData as PortalOnboarding | null)
      }
    } catch (err) {
      console.error('[portal] fetchPortalData error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    // Safety net: ensure isLoading becomes false after 10s no matter what
    const timeout = setTimeout(() => {
      if (!cancelled) setIsLoading(false)
    }, 10_000)

    // Listen for auth changes (fires INITIAL_SESSION on mount)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (cancelled) return
      setSession(s)

      if (event === 'TOKEN_REFRESHED') {
        setIsLoading(false)
        return
      }

      if (s?.user) {
        fetchPortalData(s.user.id)
      } else {
        setProfile(null)
        setClient(null)
        setOnboarding(null)
        setIsLoading(false)
      }
    })

    return () => {
      cancelled = true
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [fetchPortalData])

  const signOut = useCallback(async () => {
    try { sessionStorage.removeItem('portal_view_as_client') } catch { /* noop */ }
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
      .maybeSingle()
    setOnboarding(data as PortalOnboarding | null)
  }, [client])

  return (
    <PortalAuthContext.Provider value={{ session, profile, client, onboarding, isLoading, signOut, refreshOnboarding }}>
      {children}
    </PortalAuthContext.Provider>
  )
}
