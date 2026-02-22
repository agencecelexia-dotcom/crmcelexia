import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  trend?: { value: number; label: string }
  progress?: { current: number; target: number; label?: string }
  className?: string
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, progress, className }: StatCardProps) {
  const progressPct = progress && progress.target > 0 ? Math.min((progress.current / progress.target) * 100, 100) : 0

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
          </div>
          {Icon && (
            <div className="rounded-lg bg-primary/10 p-2.5">
              <Icon className="h-5 w-5 text-primary" />
            </div>
          )}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-2">{subtitle}</p>}
        {trend && (
          <p className={cn(
            'text-xs mt-2 font-medium',
            trend.value > 0 ? 'text-emerald-600' : trend.value < 0 ? 'text-red-600' : 'text-muted-foreground',
          )}>
            {trend.value > 0 ? '+' : ''}{trend.value}% {trend.label}
          </p>
        )}
        {progress && progress.target > 0 && (
          <div className="mt-3">
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className={cn('h-1.5 rounded-full transition-all', progressPct >= 100 ? 'bg-emerald-500' : 'bg-primary')}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round(progressPct)}% {progress.label || "de l'objectif"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
