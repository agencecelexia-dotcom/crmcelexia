import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth, type PortalOnboarding } from '../../hooks/use-portal-auth'
import { FileText, Euro, Building2, Shield, Clock, ArrowRight, AlertCircle, Check, Send } from 'lucide-react'
import { getNextOnboardingStep, isOnboardingComplete } from '../../lib/onboarding-navigation'
import { getOnboardingById, submitOnboardingForValidation } from '../../services/onboarding-service'
import { toast } from 'sonner'

type DoneKey = 'contract_signed' | 'payment_proof_uploaded' | 'gmb_access_confirmed' | 'legal'

interface Step {
  num: number
  title: string
  duration: string
  icon: React.ReactNode
  path: string
  doneKey: DoneKey
}

const STEPS: Step[] = [
  { num: 1, title: "Signature du contrat d'apport d'affaires", duration: '2 min', icon: <FileText size={20} />, path: '/portal/onboarding/contract', doneKey: 'contract_signed' },
  { num: 2, title: 'Preuve du virement de lancement', duration: '1 min', icon: <Euro size={20} />, path: '/portal/onboarding/payment', doneKey: 'payment_proof_uploaded' },
  { num: 3, title: 'Accès à votre fiche Google Business', duration: '5 min', icon: <Building2 size={20} />, path: '/portal/onboarding/gmb', doneKey: 'gmb_access_confirmed' },
  { num: 4, title: 'Assurance RC Pro + Extrait Kbis', duration: '3 min', icon: <Shield size={20} />, path: '/portal/onboarding/legal', doneKey: 'legal' },
]

function isDone(onb: PortalOnboarding, key: DoneKey): boolean {
  switch (key) {
    case 'contract_signed': return onb.contract_signed
    case 'payment_proof_uploaded': return onb.payment_proof_uploaded
    case 'gmb_access_confirmed': return onb.gmb_access_confirmed
    case 'legal': return onb.rc_pro_uploaded && onb.kbis_uploaded
  }
}

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
    <button
      type="button"
      onClick={onClick}
      className={`p-card flex w-full min-h-[80px] cursor-pointer items-center gap-4 p-4 text-left transition hover:border-violet-300 sm:p-5 ${done ? 'border-emerald-200 opacity-90' : ''}`}
    >
      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${done ? 'bg-emerald-100 text-emerald-600' : 'bg-violet-100 text-violet-600'}`}>
        {done ? <Check size={20} /> : icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          ÉTAPE {num}{done ? ' · TERMINÉE' : ''}
        </div>
        <div className="text-sm font-semibold text-gray-900 sm:text-[15px]">{title}</div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1.5 text-xs font-medium text-gray-500 sm:text-sm">
        {done ? 'Modifier' : <><Clock size={14} /> <span className="hidden sm:inline">{duration}</span></>}
      </div>
    </button>
  )
}

export function WelcomePage() {
  const { profile, onboarding, refreshOnboarding } = usePortalAuth()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const firstName = profile?.full_name?.split(' ')[0] || 'artisan'
  const hasCorrections = !!onboarding?.rejection_reason

  const stepsDone = onboarding ? STEPS.filter(s => isDone(onboarding, s.doneKey)).length : 0
  const allDone = onboarding ? isOnboardingComplete(onboarding) : false
  const firstIncomplete = onboarding ? STEPS.find(s => !isDone(onboarding, s.doneKey)) : STEPS[0]
  const nextPath = onboarding ? getNextOnboardingStep(onboarding) : '/portal/onboarding/contract'

  async function handleSubmit() {
    if (!onboarding || !allDone || submitting) return
    setSubmitting(true)
    try {
      // Re-fetch avant submit : évite la race condition si la DB a changé
      // (ex : admin a vidé une étape entre temps). Le trigger DB est notre
      // filet final, mais ça donne un meilleur message d'erreur ici.
      const fresh = await getOnboardingById(onboarding.id)
      if (!fresh) throw new Error('Onboarding introuvable')
      if (!isOnboardingComplete(fresh)) {
        await refreshOnboarding()
        throw new Error('Une étape a été modifiée. Vérifiez ci-dessous avant de re-soumettre.')
      }
      await submitOnboardingForValidation(onboarding.id)
      await refreshOnboarding()
      navigate('/portal/onboarding/pending')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[submit-onboarding] err=', err)
      toast.error(`Soumission impossible : ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  const mainCtaPath = nextPath
  const mainCtaLabel = hasCorrections
    ? `Corriger l'étape ${firstIncomplete?.num ?? '?'}`
    : stepsDone === 0
      ? "Commencer l'onboarding"
      : `Reprendre à l'étape ${firstIncomplete?.num ?? '?'}`

  return (
    <div>
      {hasCorrections && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-100 p-4 sm:gap-4 sm:p-5">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
            <AlertCircle size={18} />
          </div>
          <div className="flex-1">
            <div className="mb-1 text-sm font-bold text-amber-900 sm:text-[15px]">
              Corrections demandées par Celexia
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-amber-900/90">
              {onboarding?.rejection_reason}
            </div>
            <div className="mt-2.5 text-xs font-medium text-amber-900 sm:text-[13px]">
              Cliquez sur l'étape concernée ci-dessous pour la modifier, puis soumettez à nouveau.
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 md:mb-10">
        <span className="p-tag p-tag-violet mb-3 inline-flex">
          {hasCorrections ? 'À corriger' : stepsDone > 0 ? 'En cours' : 'Bienvenue'}
        </span>
        <h1 className="font-display mt-3 mb-3 text-3xl font-bold leading-tight md:text-4xl">
          {hasCorrections ? (
            <>Reprenons votre onboarding, <span className="text-violet-600">{firstName}</span>.</>
          ) : (
            <>Bienvenue chez Celexia,<br /><span className="text-violet-600">{firstName}</span>.</>
          )}
        </h1>
        <p className="max-w-[620px] text-base leading-relaxed text-gray-600 sm:text-[17px]">
          {hasCorrections
            ? "Cliquez sur l'étape à modifier ci-dessous, puis soumettez à nouveau votre onboarding."
            : stepsDone > 0
              ? `Vous avez complété ${stepsDone}/${STEPS.length} étapes. Vous pouvez les faire dans n'importe quel ordre.`
              : `Voici les ${STEPS.length} étapes pour activer vos campagnes. Vous pouvez les faire dans n'importe quel ordre. Comptez environ 15 minutes.`}
        </p>
      </div>

      {allDone && (
        <div className="p-card mb-8 border-emerald-200 bg-emerald-50/60 p-5 sm:p-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <Check size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-base font-bold text-gray-900 sm:text-lg">
                {hasCorrections ? 'Corrections prêtes à être soumises' : 'Toutes les étapes sont complètes 🎉'}
              </div>
              <div className="mb-4 text-sm leading-relaxed text-gray-600">
                Soumettez votre onboarding pour que Thomas ou Antoine puisse valider votre compte (≤ 24 h).
              </div>
              <button
                type="button"
                className="btn btn-primary lg w-full sm:w-auto"
                disabled={submitting}
                onClick={handleSubmit}
              >
                <Send size={18} />
                {submitting ? 'Envoi…' : hasCorrections ? 'Soumettre à nouveau' : 'Soumettre pour validation'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 grid gap-3 md:mb-10">
        {STEPS.map(s => (
          <StepCard
            key={s.num}
            num={s.num}
            title={s.title}
            duration={s.duration}
            icon={s.icon}
            done={onboarding ? isDone(onboarding, s.doneKey) : false}
            onClick={() => navigate(s.path)}
          />
        ))}
      </div>

      {!allDone && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            className="btn btn-primary lg w-full sm:w-auto"
            onClick={() => navigate(mainCtaPath)}
          >
            {mainCtaLabel} <ArrowRight size={18} />
          </button>
          <span className="text-xs text-gray-500 sm:text-[13px]">
            Vous pouvez reprendre à tout moment en vous reconnectant.
          </span>
        </div>
      )}
    </div>
  )
}
