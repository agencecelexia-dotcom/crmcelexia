import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { updateOnboarding } from '../../services/onboarding-service'
import { ProgressHeader } from '../../components/onboarding/progress-header'
import { getNextOnboardingStep } from '../../lib/onboarding-navigation'
import { ArrowLeft, ArrowRight, Info } from 'lucide-react'
import { toast } from 'sonner'

function GmbMock({ kind }: { kind: string }) {
  const boxClass = 'flex h-16 flex-col justify-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-2 sm:h-[72px]'
  if (kind === 'gmb-home') return (
    <div className={boxClass}>
      <div className="flex gap-1">
        <div className="h-[18px] w-[18px] rounded bg-gradient-to-br from-[#4285F4] to-[#34A853]" />
        <div className="h-1 flex-1 self-center rounded bg-gray-300" />
      </div>
      <div className="h-1 w-4/5 rounded bg-gray-300" />
      <div className="h-1 w-3/5 rounded bg-gray-200" />
    </div>
  )
  if (kind === 'gmb-users') return (
    <div className={boxClass}>
      <div className="h-1 w-1/2 rounded bg-gray-300" />
      <div className="flex items-center gap-1">
        <div className="h-2 w-2 rounded-full bg-gray-300" />
        <div className="h-[3px] flex-1 rounded bg-gray-200" />
      </div>
      <div className="h-2.5 w-2/5 rounded bg-violet-600" />
    </div>
  )
  if (kind === 'gmb-invite') return (
    <div className="flex h-16 flex-col justify-center gap-1 rounded-lg border border-violet-200 bg-white p-2 sm:h-[72px]">
      <div className="h-1 w-2/5 rounded bg-gray-200" />
      <div className="h-3 rounded border border-violet-200 bg-gray-50" />
      <div className="h-1 w-[70%] rounded bg-violet-200" />
    </div>
  )
  return null
}

function GmbStep({ num, title, desc, highlight, mock }: { num: string; title: string; desc: string; highlight?: boolean; mock: string }) {
  return (
    <div className={`p-card flex flex-col gap-3 p-4 md:grid md:grid-cols-[56px_minmax(0,1fr)_120px] md:items-center md:gap-4 md:p-5 ${highlight ? 'border-violet-200 bg-violet-50/30' : ''}`}>
      <div className={`font-mono text-2xl font-semibold tracking-tight md:text-[28px] ${highlight ? 'text-violet-500' : 'text-gray-300'}`}>{num}</div>
      <div className="min-w-0">
        <div className="mb-1 text-sm font-semibold text-gray-900 sm:text-[15px]">{title}</div>
        <div className="text-xs leading-relaxed text-gray-600 sm:text-[13px]">{desc}</div>
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
      let updated = onboarding
      if (!alreadyConfirmed) {
        updated = await updateOnboarding(onboarding.id, {
          gmb_access_confirmed: true,
          gmb_confirmed_at: new Date().toISOString(),
          current_step: 4,
        } as Record<string, unknown>)
        await refreshOnboarding()
      }
      navigate(getNextOnboardingStep(updated))
    } catch {
      toast.error('Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <ProgressHeader step={3} title="Accès à votre fiche Google Business" />
      <p className="mb-7 text-sm leading-relaxed text-gray-600 sm:text-[15px]">
        Pour lancer votre campagne, Celexia doit être ajouté comme gestionnaire de votre fiche Google Business Profile.
      </p>

      <div className="mb-6 grid gap-3.5">
        <GmbStep num="01" title="Ouvrez votre fiche Google Business" desc="Depuis votre compte Google, rendez-vous sur business.google.com et sélectionnez votre entreprise." mock="gmb-home" />
        <GmbStep num="02" title="Paramètres → Utilisateurs → Ajouter" desc="Cliquez sur l'icône Paramètres puis sur Utilisateurs. Un bouton « + Ajouter un utilisateur » apparaît en haut." mock="gmb-users" />
        <GmbStep num="03" title="Invitez agence.celexia@gmail.com" desc="Entrez l'email ci-dessous et sélectionnez le rôle « Propriétaire » (obligatoire pour activer la campagne)." mock="gmb-invite" highlight />
      </div>

      {/* Email info card */}
      <div className="p-card mb-7 border-violet-100 bg-violet-50 p-5">
        <div className="flex items-start gap-3">
          <Info size={20} className="flex-shrink-0 text-violet-600" />
          <div className="min-w-0">
            <div className="mb-1 text-sm font-semibold text-gray-900">Email à inviter</div>
            <code className="font-mono inline-block max-w-full rounded-md border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold break-all text-violet-700 sm:text-sm">
              agence.celexia@gmail.com
            </code>
            <div className="mt-2 text-xs text-gray-600 sm:text-[13px]">Rôle requis&nbsp;: <strong>Propriétaire</strong></div>
          </div>
        </div>
      </div>

      {/* Confirm checkbox */}
      <label className="mb-7 flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-3.5">
        <input
          type="checkbox"
          className="p-checkbox mt-0.5 flex-shrink-0"
          checked={confirmed}
          onChange={e => setConfirmed(e.target.checked)}
        />
        <span className="text-sm leading-snug text-gray-700">J'ai ajouté agence.celexia@gmail.com comme propriétaire de ma fiche Google.</span>
      </label>

      {/* Navigation */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button className="btn btn-ghost w-full sm:w-auto" onClick={() => navigate('/portal/onboarding/welcome')}>
          <ArrowLeft size={16} /> Retour
        </button>
        <button className="btn btn-primary lg w-full sm:w-auto" disabled={!confirmed || saving} onClick={handleContinue}>
          {saving ? 'Enregistrement…' : 'Continuer'} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}
