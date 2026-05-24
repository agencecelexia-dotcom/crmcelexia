import { supabase } from './client'
import type { Profile } from '@/types'

/**
 * Dedupe in-flight des fetches de profiles.
 *
 * Plusieurs providers (AuthProvider + PortalAuthProvider) écoutent
 * `onAuthStateChange` et lancent leur propre `select * from profiles`
 * en parallèle au mount + à chaque SIGNED_IN/INITIAL_SESSION. Ça causait
 * 4 requêtes profiles dupliquées au chargement du portail (bug audit
 * Cowork M1).
 *
 * Solution : cache module-level des Promises in-flight par userId.
 * Si 2 providers fetchent le même profile en même temps, ils reçoivent
 * la même Promise (= 1 seule requête réseau).
 *
 * Note : on cache uniquement la Promise pendant son resolve, pas le
 * résultat lui-même — chaque appelant gère son state local. Pour un
 * vrai cache de résultat avec staleTime, utiliser React Query.
 */

const inFlight = new Map<string, Promise<Profile | null>>()

export function fetchProfileById(userId: string, opts?: { retries?: number; timeoutMs?: number }): Promise<Profile | null> {
  const existing = inFlight.get(userId)
  if (existing) return existing

  const retries = opts?.retries ?? 1
  const timeoutMs = opts?.timeoutMs ?? 5000

  const promise = (async (): Promise<Profile | null> => {
    const work = (async () => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single()
          if (error) {
            if (attempt < retries) {
              await new Promise(r => setTimeout(r, 800))
              continue
            }
            return null
          }
          return data as Profile
        } catch {
          if (attempt < retries) {
            await new Promise(r => setTimeout(r, 800))
            continue
          }
          return null
        }
      }
      return null
    })()
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
    return Promise.race([work, timeout])
  })()

  inFlight.set(userId, promise)
  promise.finally(() => {
    // On retire après resolve, comme ça les appels successifs (> X ms après)
    // refont un vrai fetch (ce qui est OK car staleTime côté React Query
    // serait la couche au-dessus).
    inFlight.delete(userId)
  })
  return promise
}
