import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'

export function ReviewUnsubscribePage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    if (!token) {
      setState('error')
      return
    }
    supabase.rpc('review_request_unsubscribe', { p_token: token })
      .then(({ data, error }) => {
        if (error || !data) setState('error')
        else setState('success')
      })
      .catch(() => setState('error'))
  }, [token])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md text-center bg-white border border-slate-200 rounded-2xl p-10 shadow-sm">
        {state === 'loading' && (
          <>
            <div className="w-8 h-8 mx-auto border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
            <p className="mt-4 text-slate-600 text-sm">Désabonnement en cours...</p>
          </>
        )}
        {state === 'success' && (
          <>
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Vous êtes désabonné</h1>
            <p className="text-sm text-slate-600">
              Vous ne recevrez plus de demande d'avis de cet artisan.
            </p>
          </>
        )}
        {state === 'error' && (
          <>
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Lien invalide</h1>
            <p className="text-sm text-slate-600">Le lien de désabonnement n'est plus valide.</p>
          </>
        )}
      </div>
    </div>
  )
}
