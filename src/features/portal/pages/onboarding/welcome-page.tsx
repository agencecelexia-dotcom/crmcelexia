import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { FileText, Euro, Building2, Shield, Play, Clock, ArrowRight, AlertCircle } from 'lucide-react'

const STEPS = [
  { num: 1, title: "Signature du contrat d'apport d'affaires", duration: '2 min', icon: <FileText size={20} /> },
  { num: 2, title: 'Preuve du virement de lancement', duration: '1 min', icon: <Euro size={20} /> },
  { num: 3, title: 'Accès à votre fiche Google Business', duration: '5 min', icon: <Building2 size={20} /> },
  { num: 4, title: 'Assurance RC Pro + Extrait Kbis', duration: '3 min', icon: <Shield size={20} /> },
  { num: 5, title: 'Formation vidéo et QCM', duration: '4 min', icon: <Play size={20} /> },
]

function StepCard({ num, title, duration, icon }: { num: number; title: string; duration: string; icon: React.ReactNode }) {
  return (
    <div className="p-card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: 'var(--violet-100)', color: 'var(--violet-600)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', letterSpacing: '0.05em', marginBottom: 2 }}>
          ÉTAPE {num}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-900)' }}>{title}</div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--gray-500)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <Clock size={14} /> {duration}
      </div>
    </div>
  )
}

export function WelcomePage() {
  const { profile, onboarding } = usePortalAuth()
  const navigate = useNavigate()
  const firstName = profile?.full_name?.split(' ')[0] || 'artisan'
  const hasCorrections = !!onboarding?.rejection_reason

  return (
    <div>
      {hasCorrections && (
        <div style={{
          marginBottom: 24,
          padding: 20,
          borderRadius: 14,
          background: '#FEF3C7',
          border: '1px solid #FCD34D',
          display: 'flex',
          gap: 14,
          alignItems: 'flex-start',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: '#F59E0B', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <AlertCircle size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>
              Corrections demandées par Celexia
            </div>
            <div style={{ fontSize: 14, color: '#78350F', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              {onboarding?.rejection_reason}
            </div>
            <div style={{ fontSize: 13, color: '#92400E', marginTop: 10, fontWeight: 500 }}>
              Mettez à jour l'étape concernée puis soumettez à nouveau votre onboarding.
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 40 }}>
        <span className="p-tag p-tag-violet" style={{ marginBottom: 16, display: 'inline-flex' }}>
          {hasCorrections ? 'À corriger' : 'Bienvenue'}
        </span>
        <h1 className="font-display" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.1, marginTop: 14, marginBottom: 12 }}>
          {hasCorrections ? (
            <>Reprenons votre onboarding, <span style={{ color: 'var(--violet-600)' }}>{firstName}</span>.</>
          ) : (
            <>Bienvenue chez Celexia,<br /><span style={{ color: 'var(--violet-600)' }}>{firstName}</span>.</>
          )}
        </h1>
        <p style={{ fontSize: 17, color: 'var(--gray-600)', lineHeight: 1.6, maxWidth: 620 }}>
          {hasCorrections
            ? "Corrigez l'étape signalée ci-dessus, puis validez à nouveau votre onboarding."
            : 'Voici les 5 étapes pour activer vos campagnes. Comptez environ 15 minutes.'}
        </p>
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 40 }}>
        {STEPS.map(s => <StepCard key={s.num} {...s} />)}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary lg" onClick={() => navigate('/portal/onboarding/contract')}>
          {hasCorrections ? "Reprendre l'onboarding" : "Commencer l'onboarding"} <ArrowRight size={18} />
        </button>
        <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>
          Vous pourrez reprendre à tout moment depuis le lien reçu par email.
        </span>
      </div>
    </div>
  )
}
