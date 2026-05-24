import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { Loader2, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { getNextOnboardingStep } from '../lib/onboarding-navigation'
import { describeError } from '../lib/error-utils'
import { AGENCE_CELEXIA_EMAIL } from '@/lib/constants'
import '../portal.css'

export function PortalLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const navigate = useNavigate()

  async function handleForgotPassword() {
    if (!email || !email.includes('@')) {
      toast.error('Saisissez d\'abord votre email')
      return
    }
    setForgotLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/portal/auth`,
      })
      if (error) throw error
      toast.success('Un lien de réinitialisation vient d\'être envoyé à votre email.')
    } catch (err) {
      toast.error(describeError(err))
    } finally {
      setForgotLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    let stage = 'signin'
    try {
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signInErr) {
        toast.error('Email ou mot de passe incorrect')
        return
      }
      const user = signInData.user
      if (!user) throw new Error('Aucun utilisateur retourné après login')

      stage = 'profile'
      const { data: profile, error: profileErr } = await supabase
        .from('profiles').select('role').eq('id', user.id).single()
      if (profileErr) throw profileErr
      if (!profile || profile.role !== 'artisan') {
        navigate('/dashboard')
        return
      }

      stage = 'client'
      const { data: client, error: clientErr } = await supabase
        .from('clients').select('id').eq('user_id', user.id).maybeSingle()
      if (clientErr) throw clientErr
      if (!client) { navigate('/portal/onboarding/welcome'); return }

      stage = 'onboarding'
      const { data: onb, error: onbErr } = await supabase
        .from('portal_onboardings')
        .select('status, rejection_reason, contract_signed, payment_proof_uploaded, gmb_access_confirmed, rc_pro_uploaded, kbis_uploaded')
        .eq('client_id', client.id)
        .maybeSingle()
      if (onbErr) throw onbErr
      if (!onb) { navigate('/portal/onboarding/welcome'); return }

      if (onb.status === 'validated') {
        navigate('/portal/dashboard')
      } else if (onb.status === 'pending_validation') {
        navigate('/portal/onboarding/pending')
      } else if (onb.rejection_reason) {
        navigate('/portal/onboarding/welcome')
      } else {
        navigate(getNextOnboardingStep(onb))
      }
    } catch (err) {
      const msg = describeError(err)
      console.error(`[portal-login] stage=${stage} err=`, err)
      toast.error(`Erreur ${stage} : ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="portal-root flex min-h-screen items-center justify-center bg-[var(--gray-50)] p-4 sm:p-5">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 text-center sm:mb-8">
          <img src="/logocelexia.png" alt="Celexia" className="mx-auto mb-3 block h-10 w-auto sm:mb-4" />
          <h1 className="font-display mb-1.5 text-2xl font-bold text-[var(--gray-900)] sm:text-[28px]">
            Portail Client
          </h1>
          <p className="text-sm text-[var(--gray-500)] sm:text-[15px]">
            Connectez-vous à votre espace artisan
          </p>
        </div>

        <div className="p-card p-6 sm:p-7">
          <form onSubmit={handleLogin} method="post" className="grid gap-4">
            <div>
              <label className="label-input" htmlFor="portal-login-email">Email</label>
              <input
                id="portal-login-email"
                type="email"
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="votre@email.com"
                style={{ fontSize: 16 }}
                required
                autoFocus
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label-input" htmlFor="portal-login-password">Mot de passe</label>
              <input
                id="portal-login-password"
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ fontSize: 16 }}
                required
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary lg w-full"
              disabled={loading}
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              Se connecter
            </button>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={forgotLoading}
              className="text-center text-[13px] text-[var(--violet-600)] hover:underline"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {forgotLoading ? 'Envoi…' : 'Mot de passe oublié ?'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[13px] text-[var(--gray-400)]">
          Pas encore de compte ? Contactez{' '}
          <a
            href={`mailto:${AGENCE_CELEXIA_EMAIL}`}
            className="font-semibold text-[var(--violet-600)] no-underline hover:underline"
          >
            {AGENCE_CELEXIA_EMAIL}
          </a>
        </p>
      </div>
    </div>
  )
}
