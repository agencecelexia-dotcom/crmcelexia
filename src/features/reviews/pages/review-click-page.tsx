import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'

/**
 * Page publique /r/:token
 *
 * Appelée quand un client final clique sur le lien "Laisser un avis" dans
 * l'email envoyé par un artisan. La page :
 *   1. Affiche un loader "On vous redirige vers Google..."
 *   2. Appelle l'RPC `review_request_click` qui logue le clic et retourne
 *      l'URL Google de la fiche artisan
 *   3. Redirige le navigateur vers cette URL Google
 *
 * Si le token est invalide → message d'erreur sobre.
 */
export function ReviewClickPage() {
  const { token } = useParams<{ token: string }>()
  const [error, setError] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string>('')

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
        const row = data[0]
        setCompanyName(row.company_name || '')
        // Redirige après 1.2s pour laisser le temps d'afficher
        setTimeout(() => {
          if (!cancelled) window.location.href = row.google_review_url
        }, 1200)
      } catch (e) {
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
          <div className="text-5xl mb-4">⚠</div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Lien invalide</h1>
          <p className="text-sm text-slate-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md text-center bg-white border border-slate-200 rounded-2xl p-10 shadow-sm">
        <div className="flex justify-center mb-4">
          <div className="text-4xl text-amber-400">★ ★ ★ ★ ★</div>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">Merci !</h1>
        <p className="text-slate-700 text-base mb-6">
          {companyName ? `${companyName} vous remercie.` : 'Merci de votre confiance.'}
          <br />
          On vous redirige vers Google pour laisser votre avis...
        </p>
        <div className="flex justify-center">
          <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
        </div>
      </div>
    </div>
  )
}
