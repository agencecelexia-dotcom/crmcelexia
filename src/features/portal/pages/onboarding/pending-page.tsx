import { usePortalAuth } from '../../hooks/use-portal-auth'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Clock, Circle, Loader2 } from 'lucide-react'

const STEPS = [
  { label: 'Contrat signé', key: 'contract_signed' },
  { label: 'Preuve de paiement', key: 'payment_proof_uploaded' },
  { label: 'Accès Google Business', key: 'gmb_access_confirmed' },
  { label: 'Documents légaux', key: 'rc_pro_uploaded' },
  { label: 'Formation validée', key: 'quiz_completed_at' },
  { label: 'Validation par Celexia', key: 'validated_at' },
] as const

export function PendingPage() {
  const { onboarding } = usePortalAuth()

  if (!onboarding) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    )
  }

  const stepDone = (key: string) => {
    const val = (onboarding as unknown as Record<string, unknown>)[key]
    return val === true || (typeof val === 'string' && val.length > 0)
  }

  return (
    <div className="max-w-lg mx-auto text-center">
      {/* Status icon */}
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-violet-100">
        <Clock className="h-10 w-10 text-violet-600" />
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
        Onboarding soumis !
      </h1>
      <p className="text-base text-gray-500 mb-8">
        Votre dossier est en cours de validation par l'équipe Celexia. Vous recevrez un email dès que votre compte sera activé.
      </p>

      {/* Timeline */}
      <Card className="text-left mb-8">
        <CardContent className="pt-5">
          <div className="space-y-4">
            {STEPS.map(({ label, key }, i) => {
              const done = stepDone(key)
              const isCurrent = !done && (i === 0 || stepDone(STEPS[i - 1].key))
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center">
                    {done ? (
                      <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                    ) : isCurrent ? (
                      <div className="relative">
                        <Clock className="h-6 w-6 text-violet-600" />
                        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-violet-500 animate-pulse" />
                      </div>
                    ) : (
                      <Circle className="h-6 w-6 text-gray-300" />
                    )}
                    {i < STEPS.length - 1 && (
                      <div className={`absolute top-6 left-1/2 -translate-x-1/2 w-px h-5 ${done ? 'bg-emerald-300' : 'bg-gray-200'}`} />
                    )}
                  </div>
                  <p className={`text-sm font-medium ${done ? 'text-emerald-700' : isCurrent ? 'text-violet-700' : 'text-gray-400'}`}>
                    {label}
                  </p>
                  {isCurrent && (
                    <span className="ml-auto text-xs text-violet-600 font-medium">En attente · 24h max</span>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button variant="outline" asChild>
          <a href="mailto:agence.celexia@gmail.com">Contacter Celexia</a>
        </Button>
      </div>
    </div>
  )
}
