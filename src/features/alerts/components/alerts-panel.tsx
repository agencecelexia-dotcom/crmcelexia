import { useSmartAlerts } from '../hooks/use-alerts'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Bell,
  Flame,
  Info,
} from 'lucide-react'

const SEVERITY_STYLES = {
  critical: 'border-red-300 bg-red-50/50',
  warning: 'border-orange-300 bg-orange-50/50',
  info: 'border-blue-200 bg-blue-50/30',
}

const SEVERITY_ICON = {
  critical: <Flame className="h-4 w-4 text-red-600" />,
  warning: <AlertTriangle className="h-4 w-4 text-orange-600" />,
  info: <Info className="h-4 w-4 text-blue-600" />,
}

export function AlertsPanel() {
  const { profile, isFounder } = useAuth()
  const commercialId = isFounder ? undefined : profile?.id
  const { data: alerts, isLoading } = useSmartAlerts(commercialId)
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Alertes intelligentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!alerts || alerts.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-green-600" />
            Alertes intelligentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucune alerte - Tout est en ordre !
          </p>
        </CardContent>
      </Card>
    )
  }

  const criticalCount = alerts.filter(a => a.severity === 'critical').length
  const warningCount = alerts.filter(a => a.severity === 'warning').length

  return (
    <Card className={criticalCount > 0 ? 'border-red-300' : warningCount > 0 ? 'border-orange-300' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Alertes intelligentes ({alerts.length})
          </CardTitle>
          <div className="flex gap-1.5">
            {criticalCount > 0 && (
              <Badge variant="destructive" className="text-xs">{criticalCount} critiques</Badge>
            )}
            {warningCount > 0 && (
              <Badge className="text-xs bg-orange-500">{warningCount} avertissements</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-lg border p-3 cursor-pointer hover:shadow-sm transition-shadow ${SEVERITY_STYLES[alert.severity]}`}
              onClick={() => alert.link && navigate(alert.link)}
            >
              <div className="flex items-start gap-3">
                {SEVERITY_ICON[alert.severity]}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium">{alert.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{alert.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
