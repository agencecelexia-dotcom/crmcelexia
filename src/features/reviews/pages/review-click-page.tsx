import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'

/**
 * Page publique /r/:token
 *
 * Tracking + redirect quasi instantané vers la fiche Google de l'artisan.
 * On affiche un splash minimal (au cas où la RPC mette > 500ms) puis
 * window.location.replace dès que la RPC a répondu.
 */
export function ReviewClickPage() {
  const { token } = useParams<{ token: string }>()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError('Lien invalide')
      return
    }
    let cancelled = false
    async function go() {
      try {
        const { data, error } = await supabase.rpc('review_request_click', { p_token: token })
        if (cancelled) return
        if (error || !data || data.length === 0) {
          setError("Ce lien n'est plus valide ou a déjà été utilisé.")
          return
        }
        const url = data[0]?.google_review_url
        if (!url) {
          setError("Lien Google manquant pour cette campagne.")
          return
        }
        // Redirect immédiat — pas de timeout.
        window.location.replace(url)
      } catch {
        if (!cancelled) setError("Une erreur est survenue, réessayez dans quelques minutes.")
      }
    }
    go()
    return () => { cancelled = true }
  }, [token])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md text-center bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Lien invalide</h1>
          <p className="text-sm text-slate-600">{error}</p>
        </div>
      </div>
    )
  }

  // Splash minimaliste pendant la RPC (~200-400ms typique).
  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="text-center">
        <div className="w-6 h-6 mx-auto border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
        <p className="mt-3 text-sm text-slate-500">Redirection…</p>
      </div>
    </div>
  )
}
