import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, Upload, Globe, Shield, Play, Clock, ArrowRight } from 'lucide-react'

const STEPS = [
  { num: 1, title: 'Signer le contrat', duration: '2 min', icon: FileText },
  { num: 2, title: 'Preuve de paiement', duration: '3 min', icon: Upload },
  { num: 3, title: 'Accès Google Business', duration: '5 min', icon: Globe },
  { num: 4, title: 'Documents légaux', duration: '3 min', icon: Shield },
  { num: 5, title: 'Formation + QCM', duration: '10 min', icon: Play },
]

export function WelcomePage() {
  const { profile } = usePortalAuth()
  const navigate = useNavigate()
  const firstName = profile?.full_name?.split(' ')[0] || 'artisan'

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100">
          <img src="/logocelexia.png" alt="" className="h-8" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
          Bienvenue chez Celexia, {firstName}.
        </h1>
        <p className="text-base text-gray-500 max-w-md mx-auto">
          5 étapes rapides pour activer votre compte et commencer à recevoir des leads qualifiés.
        </p>
      </div>

      <div className="space-y-3 mb-8">
        {STEPS.map(({ num, title, duration, icon: Icon }) => (
          <Card key={num} className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-4 py-4 px-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-0.5">
                  Étape {num}
                </p>
                <p className="text-sm font-semibold text-gray-900">{title}</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 shrink-0">
                <Clock className="h-3.5 w-3.5" />
                {duration}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button
        className="w-full bg-violet-600 hover:bg-violet-700 h-12 text-base font-semibold"
        onClick={() => navigate('/portal/onboarding/contract')}
      >
        Commencer l'onboarding
        <ArrowRight className="ml-2 h-5 w-5" />
      </Button>
    </div>
  )
}
