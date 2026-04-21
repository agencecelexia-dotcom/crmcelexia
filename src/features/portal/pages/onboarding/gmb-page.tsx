import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { updateOnboarding } from '../../services/onboarding-service'
import { ProgressHeader } from '../../components/onboarding/progress-header'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, ArrowRight, Loader2, Globe, Users, Mail } from 'lucide-react'
import { toast } from 'sonner'

const GMB_STEPS = [
  { num: 1, text: 'Allez sur business.google.com', icon: Globe },
  { num: 2, text: 'Cliquez sur votre établissement', icon: Globe },
  { num: 3, text: 'Dans le menu à gauche, cliquez sur « Utilisateurs »', icon: Users },
  { num: 4, text: 'Cliquez sur « Ajouter des utilisateurs » (icône +)', icon: Users },
  { num: 5, text: 'Entrez l\'adresse : agence.celexia@gmail.com', icon: Mail },
  { num: 6, text: 'Sélectionnez le rôle « Propriétaire »', icon: Users },
  { num: 7, text: 'Cliquez sur « Inviter » et c\'est bon !', icon: Users },
]

export function GmbPage() {
  const { onboarding, refreshOnboarding } = usePortalAuth()
  const navigate = useNavigate()
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!onboarding || !confirmed) return
    setSaving(true)
    try {
      await updateOnboarding(onboarding.id, {
        gmb_access_confirmed: true,
        gmb_confirmed_at: new Date().toISOString(),
        current_step: 4,
      } as Record<string, unknown>)
      await refreshOnboarding()
      toast.success('Accès GMB confirmé !')
      navigate('/portal/onboarding/legal')
    } catch {
      toast.error('Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <ProgressHeader step={3} title="Accès Google Business" subtitle="Ajoutez Celexia comme gestionnaire de votre fiche Google pour qu'on puisse lancer vos campagnes." />

      <Card className="mb-6">
        <CardContent className="pt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 mb-3">
            Comment faire (2 min)
          </p>
          <ol className="space-y-3">
            {GMB_STEPS.map(({ num, text }) => (
              <li key={num} className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                  {num}
                </div>
                <p className="text-sm text-gray-700 pt-0.5">{text}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 mb-6">
        <p className="text-sm font-semibold text-violet-900 mb-1">Email à ajouter :</p>
        <p className="font-mono text-sm text-violet-700 font-semibold">agence.celexia@gmail.com</p>
        <p className="text-xs text-violet-600 mt-1">Rôle : <strong>Propriétaire</strong></p>
      </div>

      <div className="flex items-start gap-3 mb-8">
        <Checkbox id="gmb-confirm" checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />
        <label htmlFor="gmb-confirm" className="text-sm text-gray-700 cursor-pointer">
          J'ai ajouté agence.celexia@gmail.com comme propriétaire de ma fiche Google Business.
        </label>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => navigate('/portal/onboarding/payment')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Retour
        </Button>
        <Button
          className="bg-violet-600 hover:bg-violet-700"
          disabled={!confirmed || saving}
          onClick={handleSubmit}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Continuer <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
