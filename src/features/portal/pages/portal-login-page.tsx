import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { Loader2, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { getNextOnboardingStep } from '../lib/onboarding-navigation'
import '../portal.css'

export function PortalLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    let stage = 'signin'
    try {
      // 1. Sign in
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signInErr) {
        toast.error('Email ou mot de passe incorrect')
        return
      }
      const user = signInData.user
      if (!user) throw new Error('Aucun utilisateur retourné après login')

      // 2. Profile
      stage = 'profile'
      const { data: profile, error: profileErr } = await supabase
        .from('profiles').select('role').eq('id', user.id).single()
      if (profileErr) throw profileErr
      if (!profile || profile.role !== 'artisan') {
        navigate('/dashboard')
        return
      }

      // 3. Client
      stage = 'client'
      const { data: client, error: clientErr } = await supabase
        .from('clients').select('id').eq('user_id', user.id).maybeSingle()
      if (clientErr) throw clientErr
      if (!client) { navigate('/portal/onboarding/welcome'); return }

      // 4. Onboarding
      stage = 'onboarding'
      const { data: onb, error: onbErr } = await supabase
        .from('portal_onboardings')
        .select('status, rejection_reason, contract_signed, payment_proof_uploaded, gmb_access_confirmed, rc_pro_uploaded, kbis_uploaded')
        .eq('client_id', client.id)
        .maybeSingle()
      if (onbErr) throw onbErr
      if (!onb) { navigate('/portal/onboarding/welcome'); return }

      // 5. Route based on status
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
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[portal-login] stage=${stage} err=`, err)
      toast.error(`Erreur ${stage} : ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="portal-root" style={{ minHeight: '100vh', background: 'var(--gray-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logocelexia.png" alt="Celexia" style={{ height: 40, margin: '0 auto 16px', display: 'block' }} />
          <h1 className="font-display" style={{ fontSize: 28, fontWeight: 700, color: 'var(--gray-900)', marginBottom: 6 }}>
            Portail Client
          </h1>
          <p style={{ fontSize: 15, color: 'var(--gray-500)' }}>Connectez-vous à votre espace artisan</p>
        </div>

        <div className="p-card" style={{ padding: 28 }}>
          <form onSubmit={handleLogin} style={{ display: 'grid', gap: 16 }}>
            <div>
              <label className="label-input">Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label-input">Mot de passe</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary lg" disabled={loading} style={{ width: '100%' }}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              Se connecter
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--gray-400)', marginTop: 20 }}>
          Pas encore de compte ? Contactez{' '}
          <a href="mailto:agence.celexia@gmail.com" style={{ color: 'var(--violet-600)', fontWeight: 600, textDecoration: 'none' }}>agence.celexia@gmail.com</a>
        </p>
      </div>
    </div>
  )
}
