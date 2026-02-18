import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { usePerformanceStats, useKeyRates } from '../hooks/use-analytics'
import { useDashboardStats } from '@/features/dashboard/hooks/use-dashboard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Target,
  TrendingUp,
  DollarSign,
  Phone,
  Award,
} from 'lucide-react'
import { formatCurrency, formatPercentage } from '@/lib/format'

interface ObjectiveConfig {
  target_mrr: number
  target_ca: number
  target_closing_rate: number
  target_rdv_rate: number
}

export function ObjectivesPage() {
  const { profile, isFounder } = useAuth()
  const commercialId = isFounder ? undefined : profile?.id

  const { data: perfStats } = usePerformanceStats(commercialId)
  const { data: keyRates } = useKeyRates(commercialId)
  const { data: dashStats } = useDashboardStats(commercialId)

  const [objectives, setObjectives] = useState<ObjectiveConfig>({
    target_mrr: 5000,
    target_ca: 20000,
    target_closing_rate: 25,
    target_rdv_rate: 10,
  })

  const mrrProgress = objectives.target_mrr > 0 && perfStats ? (perfStats.mrr_generated / objectives.target_mrr) * 100 : 0
  const caProgress = objectives.target_ca > 0 && perfStats ? (perfStats.ca_this_month / objectives.target_ca) * 100 : 0
  const closingProgress = objectives.target_closing_rate > 0 && keyRates ? (keyRates.global_closing_rate / objectives.target_closing_rate) * 100 : 0
  const rdvProgress = objectives.target_rdv_rate > 0 && keyRates ? (keyRates.call_to_rdv_rate / objectives.target_rdv_rate) * 100 : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Objectifs Commerciaux</h1>
        <p className="text-muted-foreground">
          Définissez et suivez vos objectifs mensuels
        </p>
      </div>

      {/* Objective configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Définir les objectifs du mois
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Objectif MRR / mois</Label>
              <Input
                type="number"
                min={0}
                value={objectives.target_mrr}
                onChange={e => setObjectives(o => ({ ...o, target_mrr: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Objectif CA / mois</Label>
              <Input
                type="number"
                min={0}
                value={objectives.target_ca}
                onChange={e => setObjectives(o => ({ ...o, target_ca: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Taux de closing cible (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={objectives.target_closing_rate}
                onChange={e => setObjectives(o => ({ ...o, target_closing_rate: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Taux RDV cible (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={objectives.target_rdv_rate}
                onChange={e => setObjectives(o => ({ ...o, target_rdv_rate: Number(e.target.value) }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <ProgressCard
          title="MRR mensuel"
          icon={<TrendingUp className="h-5 w-5 text-primary" />}
          current={perfStats?.mrr_generated ?? 0}
          target={objectives.target_mrr}
          progress={mrrProgress}
          format="currency"
        />
        <ProgressCard
          title="CA mensuel"
          icon={<DollarSign className="h-5 w-5 text-green-600" />}
          current={perfStats?.ca_this_month ?? 0}
          target={objectives.target_ca}
          progress={caProgress}
          format="currency"
        />
        <ProgressCard
          title="Taux de closing"
          icon={<Target className="h-5 w-5 text-purple-600" />}
          current={keyRates?.global_closing_rate ?? 0}
          target={objectives.target_closing_rate}
          progress={closingProgress}
          format="percentage"
        />
        <ProgressCard
          title="Taux Appel &rarr; RDV"
          icon={<Phone className="h-5 w-5 text-blue-600" />}
          current={keyRates?.call_to_rdv_rate ?? 0}
          target={objectives.target_rdv_rate}
          progress={rdvProgress}
          format="percentage"
        />
      </div>

      {/* Summary */}
      {dashStats && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" />
              Résumé du mois en cours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4 text-center">
              <div>
                <p className="text-sm text-muted-foreground">Appels ce mois</p>
                <p className="text-2xl font-bold">{dashStats.calls_week ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">RDV ce mois</p>
                <p className="text-2xl font-bold">{dashStats.rdv_week ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Taux show-up</p>
                <p className="text-2xl font-bold">{dashStats.show_up_rate ?? 0}%</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rappels en retard</p>
                <p className="text-2xl font-bold text-red-600">{dashStats.reminders_overdue ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ProgressCard({
  title,
  icon,
  current,
  target,
  progress,
  format,
}: {
  title: string
  icon: React.ReactNode
  current: number
  target: number
  progress: number
  format: 'currency' | 'percentage'
}) {
  const clampedProgress = Math.min(progress, 100)
  const isAchieved = progress >= 100
  const displayCurrent = format === 'currency' ? formatCurrency(current) : formatPercentage(current)
  const displayTarget = format === 'currency' ? formatCurrency(target) : formatPercentage(target)

  return (
    <Card className={isAchieved ? 'border-green-300 bg-green-50/30' : ''}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-medium" dangerouslySetInnerHTML={{ __html: title }} />
          </div>
          {isAchieved && (
            <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
              Atteint !
            </span>
          )}
        </div>
        <div className="flex items-end justify-between mb-2">
          <span className="text-2xl font-bold">{displayCurrent}</span>
          <span className="text-sm text-muted-foreground">/ {displayTarget}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${isAchieved ? 'bg-green-500' : 'bg-primary'}`}
            style={{ width: `${clampedProgress}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">{Math.round(progress)}% de l'objectif</p>
      </CardContent>
    </Card>
  )
}
