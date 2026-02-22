import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { supabase, supabaseMisconfigured } from '@/lib/supabase/client'
import { AuthContext, type AuthContextType } from '../hooks/use-auth'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '@/types'

async function fetchProfileFromDB(userId: string): Promise<Profile | null> {
  const profilePromise = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()

        if (error) {
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 1000))
            continue
          }
          return null
        }
        return data as Profile
      } catch {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 1000))
          continue
        }
        return null
      }
    }
    return null
  })()

  return Promise.race([
    profilePromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ])
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return

      setSession(s)

      try {
        if (s?.user) {
          const p = await fetchProfileFromDB(s.user.id)
          if (mounted) setProfile(p)
        } else {
          if (mounted) setProfile(null)
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
  }

  return <AuthContext value={value}>{children}</AuthContext>
}
