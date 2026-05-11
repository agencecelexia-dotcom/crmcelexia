import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CheckCircle2, Clock, FileText, Euro, Building2, Shield,
  ExternalLink, AlertCircle, Hourglass,
} from 'lucide-react'
import { useClientOnboarding } from '../hooks/use-admin-onboardings'
import { formatDate } from '@/lib/format'
import type { AdminOnboardingRow } from '../services/admin-onboarding-service'

type StepDef = {
  key: string
  label: string
  icon: typeof FileText
  doneCheck: (o: AdminOnboardingRow) => boolean
  timestampField: (o: AdminOnboardingRow) => string | null
}

const STEPS: StepDef[] = [
  {
    key: 'contract',
    label: 'Contrat signé',
    icon: FileText,
    doneCheck: o => o.contract_signed,
    timestampField: o => o.contract_signed_at,
  },
  {
    key: 'payment',
    label: 'Virement reçu',
    icon: Euro,
    doneCheck: o => o.payment_proof_uploaded,
    timestampField: o => null,
  },
  {
    key: 'gmb',
    label: 'Accès Google Business',
    icon: Building2,
    doneCheck: o => o.gmb_access_confirmed,
    timestampField: o => o.gmb_confirmed_at,
  },
  {
    key: 'legal',
    label: 'RC Pro + Kbis',
    icon: Shield,
    doneCheck: o => o.rc_pro_uploaded && o.kbis_uploaded,
    timestampField: o => null,
  },
]

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
    in_progress: { label: 'En cours', className: 'bg-blue-100 text-blue-700', icon: Clock },
    pending_validation: { label: 'À valider', className: 'bg-violet-100 text-violet-700', icon: Hourglass },
    validated: { label: 'Validé', className: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
    rejected: { label: 'Refusé', className: 'bg-red-100 text-red-700', icon: AlertCircle },
  }
  const item = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-700', icon: Clock }
  const Icon = item.icon
  return (
    <Badge className={`${item.className} gap-1`}>
      <Icon className="h-3 w-3" /> {item.label}
    </Badge>
  )
}

export function PortalOnboardingCard({ clientId }: { clientId: string }) {
  const { data: onb, isLoading } = useClientOnboarding(clientId)
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-5 w-48 mb-3" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!onb) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <AlertCircle className="h-4 w-4" />
            Pas d'onboarding portail en cours pour ce client.
          </div>
        </CardContent>
      </Card>
    )
  }

  const stepsDone = STEPS.filter(s => s.doneCheck(onb)).length
  const progressPct = Math.round((stepsDone / STEPS.length) * 100)
  const hasCorrections = onb.status === 'in_progress' && !!onb.rejection_reason

  return (
    <Card className={
      onb.status === 'pending_validation' ? 'border-violet-200 bg-violet-50/30'
        : hasCorrections ? 'border-amber-200 bg-amber-50/30'
        : onb.status === 'validated' ? 'border-emerald-200'
        : ''
    }>
      <CardContent className="pt-5">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              Onboarding portail
            </div>
            <div className="mt-0.5 text-xs text-gray-500">
              {stepsDone}/{STEPS.length} étapes complétées · démarré {formatDate(onb.created_at)}
              {onb.completed_at && ` · soumis ${formatDate(onb.completed_at)}`}
              {onb.validated_at && ` · validé ${formatDate(onb.validated_at)}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={onb.status} />
            {(onb.status === 'pending_validation' || hasCorrections) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate('/onboardings')}
              >
                Gérer <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full transition-all ${
              onb.status === 'validated' ? 'bg-emerald-500'
                : onb.status === 'pending_validation' ? 'bg-violet-500'
                : 'bg-blue-500'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Steps grid */}
        <div className="grid gap-2 sm:grid-cols-2">
          {STEPS.map(step => {
            const done = step.doneCheck(onb)
            const ts = step.timestampField(onb)
            const Icon = step.icon
            return (
              <div
                key={step.key}
                className={`flex items-center gap-3 rounded-lg border p-2.5 ${
                  done ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-200 bg-white'
                }`}
              >
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md ${
                  done ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-xs font-medium ${done ? 'text-gray-900' : 'text-gray-500'}`}>
                    {step.label}
                  </div>
                  {done && ts && (
                    <div className="text-[10px] text-gray-500">
                      {formatDate(ts)}
                    </div>
                  )}
                  {done && !ts && (
                    <div className="text-[10px] text-emerald-600">Validé</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Rejection reason if applicable */}
        {hasCorrections && onb.rejection_reason && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="text-xs font-semibold text-amber-900 mb-1">
              Corrections demandées :
            </div>
            <div className="text-xs text-amber-900 whitespace-pre-wrap">
              {onb.rejection_reason}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
