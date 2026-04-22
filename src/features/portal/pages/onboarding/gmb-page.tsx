import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { updateOnboarding } from '../../services/onboarding-service'
import { ProgressHeader } from '../../components/onboarding/progress-header'
import { ArrowLeft, ArrowRight, Info } from 'lucide-react'
import { toast } from 'sonner'

function GmbMock({ kind }: { kind: string }) {
  const box: React.CSSProperties = { background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 8, height: 72, padding: 8, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }
  if (kind === 'gmb-home') return (
    <div style={box}>
      <div style={{ display: 'flex', gap: 4 }}>
        <div style={{ width: 18, height: 18, borderRadius: 4, background: 'linear-gradient(135deg,#4285F4,#34A853)' }} />
        <div style={{ flex: 1, height: 4, background: 'var(--gray-300)', borderRadius: 2, alignSelf: 'center' }} />
      </div>
      <div style={{ height: 4, background: 'var(--gray-300)', borderRadius: 2, width: '80%' }} />
      <div style={{ height: 4, background: 'var(--gray-200)', borderRadius: 2, width: '60%' }} />
    </div>
  )
  if (kind === 'gmb-users') return (
    <div style={box}>
      <div style={{ height: 4, background: 'var(--gray-300)', borderRadius: 2, width: '50%' }} />
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gray-300)' }} />
        <div style={{ flex: 1, height: 3, background: 'var(--gray-200)', borderRadius: 2 }} />
      </div>
      <div style={{ height: 10, background: 'var(--violet-600)', borderRadius: 4, width: '40%' }} />
    </div>
  )
  if (kind === 'gmb-invite') return (
    <div style={{ ...box, background: 'white', borderColor: 'var(--violet-200)' }}>
      <div style={{ height: 4, background: 'var(--gray-200)', borderRadius: 2, width: '40%' }} />
      <div style={{ height: 12, background: 'var(--gray-50)', border: '1px solid var(--violet-200)', borderRadius: 4 }} />
      <div style={{ height: 4, background: 'var(--violet-200)', borderRadius: 2, width: '70%' }} />
    </div>
  )
  return null
}

function GmbStep({ num, title, desc, highlight, mock }: { num: string; title: string; desc: string; highlight?: boolean; mock: string }) {
  return (
    <div className="p-card" style={{
      padding: 18, display: 'grid', gridTemplateColumns: '60px minmax(0, 1fr) 120px', gap: 16, alignItems: 'center',
      borderColor: highlight ? 'var(--violet-200)' : undefined,
      background: highlight ? 'rgba(124,58,237,0.02)' : 'white',
    }}>
      <div className="font-mono" style={{ fontSize: 28, fontWeight: 600, color: highlight ? 'var(--violet-500)' : 'var(--gray-300)', letterSpacing: '-0.02em' }}>{num}</div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-900)', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.55 }}>{desc}</div>
      </div>
      <GmbMock kind={mock} />
    </div>
  )
}

export function GmbPage() {
  const { onboarding, refreshOnboarding } = usePortalAuth()
  const navigate = useNavigate()
  const alreadyConfirmed = !!onboarding?.gmb_access_confirmed
  const [confirmed, setConfirmed] = useState(alreadyConfirmed)
  const [saving, setSaving] = useState(false)

  async function handleContinue() {
    if (!onboarding || !confirmed) return
    setSaving(true)
    try {
      // Skip update if already confirmed (artisan just passed through)
      if (!alreadyConfirmed) {
        await updateOnboarding(onboarding.id, {
          gmb_access_confirmed: true,
          gmb_confirmed_at: new Date().toISOString(),
          current_step: 4,
        } as Record<string, unknown>)
        await refreshOnboarding()
      }
      navigate('/portal/onboarding/legal')
    } catch {
      toast.error('Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <ProgressHeader step={3} title="Accès à votre fiche Google Business" />
      <p style={{ fontSize: 15, color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: 28 }}>
        Pour lancer votre campagne, Celexia doit être ajouté comme gestionnaire de votre fiche Google Business Profile.
      </p>

      <div style={{ display: 'grid', gap: 14, marginBottom: 24 }}>
        <GmbStep num="01" title="Ouvrez votre fiche Google Business" desc="Depuis votre compte Google, rendez-vous sur business.google.com et sélectionnez votre entreprise." mock="gmb-home" />
        <GmbStep num="02" title="Paramètres → Utilisateurs → Ajouter" desc="Cliquez sur l'icône Paramètres puis sur Utilisateurs. Un bouton « + Ajouter un utilisateur » apparaît en haut." mock="gmb-users" />
        <GmbStep num="03" title="Invitez agence.celexia@gmail.com" desc="Entrez l'email ci-dessous et sélectionnez le rôle « Propriétaire » (obligatoire pour activer la campagne)." mock="gmb-invite" highlight />
      </div>

      {/* Email info card */}
      <div className="p-card" style={{ padding: 20, background: 'var(--violet-50)', border: '1px solid var(--violet-100)', marginBottom: 28 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Info size={20} style={{ color: 'var(--violet-600)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-900)', marginBottom: 4 }}>Email à inviter</div>
            <code className="font-mono" style={{ fontSize: 14, background: 'white', padding: '6px 12px', borderRadius: 6, color: 'var(--violet-700)', fontWeight: 600, border: '1px solid var(--violet-200)', display: 'inline-block' }}>
              agence.celexia@gmail.com
            </code>
            <div style={{ fontSize: 13, color: 'var(--gray-600)', marginTop: 8 }}>Rôle requis : <strong>Propriétaire</strong></div>
          </div>
        </div>
      </div>

      {/* Confirm checkbox */}
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', padding: 14, background: 'white', border: '1px solid var(--gray-200)', borderRadius: 10, marginBottom: 28 }}>
        <input type="checkbox" className="p-checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
        <span style={{ fontSize: 14, color: 'var(--gray-700)' }}>J'ai ajouté agence.celexia@gmail.com comme propriétaire de ma fiche Google.</span>
      </label>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={() => navigate('/portal/onboarding/payment')}><ArrowLeft size={16} /> Retour</button>
        <button className="btn btn-primary lg" disabled={!confirmed || saving} onClick={handleContinue}>
          {saving ? 'Enregistrement...' : 'Continuer'} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}
