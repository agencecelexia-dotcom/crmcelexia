import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { supabase, supabaseMisconfigured } from '@/lib/supabase/client'
import { fetchProfileById } from '@/lib/supabase/profile-cache'
import { AuthContext, type AuthContextType } from '../hooks/use-auth'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '@/types'

// fetchProfileById → utilise désormais le cache shared profile-cache.ts
// pour dedupe avec PortalAuthProvider (bug audit Cowork M1 : 4× requête
// profiles au chargement du portail).

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Expose a way to re-fetch the profile (used by ProtectedRoute as safety net)
  const refreshProfile = useCallback(async () => {
    const { data: { session: s } } = await supabase.auth.getSession()
    if (s?.user) {
      const p = await fetchProfileById(s.user.id)
      if (p) setProfile(p)
      return p
    }
    return null
  }, [])

  useEffect(() => {
    let mounted = true

    if (supabaseMisconfigured) {
      setIsLoading(false)
      return
    }

    const timeout = setTimeout(() => {
      if (mounted) {
        setIsLoading(false)
      }
    }, 5_000)

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (!mounted) return

      setSession(s)

      // Token refresh doesn't change the profile — skip refetch entirely
      if (event === 'TOKEN_REFRESHED') {
        if (mounted) setIsLoading(false)
        return
      }

      // Signed out — clear profile
      if (event === 'SIGNED_OUT' || !s?.user) {
        if (mounted) {
          setProfile(null)
          setIsLoading(false)
        }
        return
      }

      // INITIAL_SESSION or SIGNED_IN — fetch profile
      try {
        const p = await fetchProfileById(s.user.id)
        if (mounted) {
          // Never overwrite a valid profile with null on transient failures
          setProfile((prev) => p ?? prev)
        }
      } finally {
        if (mounted) setIsLoading(false)
      }
    })

    return () => {
      mounted = false
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setProfile(null)
  }, [])

  const isFounder = profile?.role === 'fondateur' || profile?.role === 'co_fondateur'

  const value: AuthContextType = {
    session,
    profile,
    isLoading,
    isFounder,
    signIn,
    signOut,
    refreshProfile,
  }

  return <AuthContext value={value}>{children}</AuthContext>
}
