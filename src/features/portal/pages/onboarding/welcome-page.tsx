import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { FileText, Euro, Building2, Shield, Clock, ArrowRight, AlertCircle, Check } from 'lucide-react'
import { getNextOnboardingStep } from '../../lib/onboarding-navigation'

const STEPS = [
  { num: 1, title: "Signature du contrat d'apport d'affaires", duration: '2 min', icon: <FileText size={20} />, path: '/portal/onboarding/contract', doneKey: 'contract_signed' as const },
  { num: 2, title: 'Preuve du virement de lancement', duration: '1 min', icon: <Euro size={20} />, path: '/portal/onboarding/payment', doneKey: 'payment_proof_uploaded' as const },
  { num: 3, title: 'Accès à votre fiche Google Business', duration: '5 min', icon: <Building2 size={20} />, path: '/portal/onboarding/gmb', doneKey: 'gmb_access_confirmed' as const },
  { num: 4, title: 'Assurance RC Pro + Extrait Kbis', duration: '3 min', icon: <Shield size={20} />, path: '/portal/onboarding/legal', doneKey: 'legal' as const },
]

function StepCard({
  num, title, duration, icon, done, onClick,
}: {
  num: number
  title: string
  duration: string
  icon: React.ReactNode
  done: boolean
  onClick: () => void
}) {
  return (
    <div
      className="p-card"
      onClick={onClick}
      style={{
        padding: 18, display: 'flex', alignItems: 'center', gap: 16,
        cursor: 'pointer',
        opacity: done ? 0.8 : 1,
        borderColor: done ? 'var(--emerald-200, #A7F3D0)' : undefined,
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: done ? 'var(--emerald-100, #D1FAE5)' : 'var(--violet-100)',
        color: done ? 'var(--emerald-600, #059669)' : 'var(--violet-600)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {done ? <Check size={20} /> : icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', letterSpacing: '0.05em', marginBottom: 2 }}>
          ÉTAPE {num}{done ? ' · TERMINÉE' : ''}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-900)' }}>{title}</div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--gray-500)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {done ? 'Modifier' : <><Clock size={14} /> {duration}</>}
      </div>
    </div>
  )
}

export function WelcomePage() {
  const { profile, onboarding } = usePortalAuth()
  const navigate = useNavigate()
  const firstName = profile?.full_name?.split(' ')[0] || 'artisan'
  const hasCorrections = !!onboarding?.rejection_reason

  const isStepDone = (doneKey: string): boolean => {
    if (!onboarding) return false
    if (doneKey === 'legal') return onboarding.rc_pro_uploaded && onboarding.kbis_uploaded
    return !!(onboarding as unknown as Record<string, unknown>)[doneKey]
  }

  const stepsDone = STEPS.filter(s => isStepDone(s.doneKey)).length
  const allDone = stepsDone === STEPS.length
  const firstIncomplete = STEPS.find(s => !isStepDone(s.doneKey))
  const nextPath = onboarding ? getNextOnboardingStep(onboarding) : '/portal/onboarding/contract'

  // Le CTA principal pointe toujours vers la prochaine étape à compléter.
  // En mode corrections : si tout est complet on va à legal (qui montrera l'UI "Soumettre").
  // Sinon, getNextOnboardingStep pointe déjà vers la bonne étape incomplète.
  const mainCtaPath = nextPath
  const mainCtaLabel = hasCorrections
    ? allDone
      ? 'Soumettre à nouveau'
      : `Corriger l'étape ${firstIncomplete?.num ?? '?'}`
    : stepsDone === 0
      ? "Commencer l'onboarding"
      : allDone
        ? 'Finaliser mon onboarding'
        : `Reprendre à l'étape ${firstIncomplete?.num ?? '?'}`

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
              Cliquez sur l'étape concernée ci-dessous pour la modifier, puis soumettez à nouveau.
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 40 }}>
        <span className="p-tag p-tag-violet" style={{ marginBottom: 16, display: 'inline-flex' }}>
          {hasCorrections ? 'À corriger' : stepsDone > 0 ? 'En cours' : 'Bienvenue'}
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
            ? "Cliquez sur l'étape à modifier ci-dessous, puis validez à nouveau votre onboarding."
            : stepsDone > 0
              ? `Vous avez complété ${stepsDone}/${STEPS.length} étapes. Reprenez où vous en étiez.`
              : 'Voici les 5 étapes pour activer vos campagnes. Comptez environ 15 minutes.'}
        </p>
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 40 }}>
        {STEPS.map(s => (
          <StepCard
            key={s.num}
            num={s.num}
            title={s.title}
            duration={s.duration}
            icon={s.icon}
            done={isStepDone(s.doneKey)}
            onClick={() => navigate(s.path)}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary lg" onClick={() => navigate(mainCtaPath)}>
          {mainCtaLabel} <ArrowRight size={18} />
        </button>
        <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>
          Vous pouvez reprendre à tout moment en vous reconnectant.
        </span>
      </div>
    </div>
  )
}
