import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { supabase, supabaseMisconfigured } from '@/lib/supabase/client'
import { AuthContext, type AuthContextType } from '../hooks/use-auth'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '@/types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    // Retry once on failure
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()

        if (error) {
          console.error(`Profile fetch attempt ${attempt + 1} error:`, error.message)
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 1000))
            continue
          }
          return null
        }
        return data as Profile
      } catch (err) {
        console.error(`Profile fetch attempt ${attempt + 1} network error:`, err)
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 1000))
          continue
        }
        return null
      }
    }
    return null
  }, [])

  useEffect(() => {
    let mounted = true

    // If Supabase is misconfigured, stop loading immediately
    if (supabaseMisconfigured) {
      setIsLoading(false)
      return
    }

    // Safety timeout — hard cap at 8 seconds
    const timeout = setTimeout(() => {
      if (mounted) {
        console.warn('Auth: safety timeout reached (8s), forcing loaded state')
        setIsLoading(false)
      }
    }, 8_000)

    // Use ONLY onAuthStateChange — it fires INITIAL_SESSION immediately
    // This is the recommended Supabase v2+ pattern
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return

      setSession(s)

      if (s?.user) {
        const p = await fetchProfile(s.user.id)
        if (mounted) {
          setProfile(p)
          setIsLoading(false)
        }
      } else {
        if (mounted) {
          setProfile(null)
          setIsLoading(false)
        }
      }
    })

    return () => {
      mounted = false
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [fetchProfile])

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
  }

  return <AuthContext value={value}>{children}</AuthContext>
}
