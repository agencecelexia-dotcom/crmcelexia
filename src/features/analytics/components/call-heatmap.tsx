import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCallHeatmap } from '../hooks/use-analytics'
import { Flame } from 'lucide-react'

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const HOURS = Array.from({ length: 13 }, (_, i) => i + 7) // 7h-19h business hours

function getColor(rate: number, total: number): string {
  if (total === 0) return 'bg-gray-100'
  if (rate >= 50) return 'bg-emerald-500'
  if (rate >= 40) return 'bg-emerald-400'
  if (rate >= 30) return 'bg-yellow-400'
  if (rate >= 20) return 'bg-orange-400'
  if (rate >= 10) return 'bg-orange-300'
  return 'bg-red-300'
}

export function CallHeatmap({ commercialId }: { commercialId?: string }) {
  const { data: heatmap, isLoading } = useCallHeatmap(commercialId)

  if (isLoading) return <Skeleton className="h-64" />

  const grid: Record<string, { total: number; reached: number; rate: number }> = {}
  for (const cell of heatmap ?? []) {
    grid[`${cell.day}-${cell.hour}`] = cell
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Flame className="h-4 w-4 text-primary" />
          Heatmap — Taux de contact par créneau
        </CardTitle>
        <p className="text-xs text-muted-foreground">3 derniers mois · couleur = taux de décrochage</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[500px]">
            {/* Header row — hours */}
            <div className="flex gap-0.5 mb-0.5">
              <div className="w-10 shrink-0" />
              {HOURS.map(h => (
                <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground font-medium">
                  {h}h
                </div>
              ))}
            </div>

            {/* Grid rows — one per day */}
            {DAYS.map((day, dayIdx) => (
              <div key={day} className="flex gap-0.5 mb-0.5">
                <div className="w-10 shrink-0 text-xs text-muted-foreground flex items-center">
                  {day}
                </div>
                {HOURS.map(hour => {
                  const cell = grid[`${dayIdx}-${hour}`]
                  const total = cell?.total ?? 0
                  const rate = cell?.rate ?? 0
                  return (
                    <div
                      key={hour}
                      className={`flex-1 aspect-square rounded-sm ${getColor(rate, total)} transition-colors cursor-default`}
                      title={`${day} ${hour}h: ${total} appels, ${rate}% décrochage`}
                    />
                  )
                })}
              </div>
            ))}

            {/* Legend */}
            <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
              <span>Faible</span>
              <div className="flex gap-0.5">
                {['bg-red-300', 'bg-orange-300', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400', 'bg-emerald-500'].map(c => (
                  <div key={c} className={`w-4 h-3 rounded-sm ${c}`} />
                ))}
              </div>
              <span>Élevé</span>
              <span className="ml-auto">Taux de contact (%)</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
