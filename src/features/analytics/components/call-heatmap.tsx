import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCallHeatmap } from '../hooks/use-analytics'
import { Flame } from 'lucide-react'

function getColor(rate: number, total: number): string {
  if (total === 0) return 'bg-gray-100 dark:bg-gray-800'
  if (rate >= 50) return 'bg-emerald-500'
  if (rate >= 40) return 'bg-emerald-400'
  if (rate >= 30) return 'bg-yellow-400'
  if (rate >= 20) return 'bg-orange-400'
  if (rate >= 10) return 'bg-orange-300'
  return 'bg-red-300'
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

export function CallHeatmap({ commercialId }: { commercialId?: string }) {
  const { data: heatmap, isLoading } = useCallHeatmap(commercialId)

  if (isLoading) return <Skeleton className="h-80" />

  if (!heatmap || heatmap.niches.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" />
            Heatmap — Niches par créneau horaire
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Pas assez de données (min. 5 appels par niche)</p>
        </CardContent>
      </Card>
    )
  }

  const { cells, niches, hours } = heatmap
  const grid: Record<string, { total: number; rate: number }> = {}
  for (const cell of cells) {
    grid[`${cell.niche}|${cell.hour}`] = { total: cell.total, rate: cell.rate }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Flame className="h-4 w-4 text-primary" />
          Qui appeler et quand ?
        </CardTitle>
        <p className="text-xs text-muted-foreground">3 derniers mois · couleur = taux de décrochage par niche et heure</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Header row — hours */}
            <div className="flex gap-0.5 mb-0.5">
              <div className="w-28 shrink-0" />
              {hours.map(h => (
                <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground font-medium">
                  {h}h
                </div>
              ))}
            </div>

            {/* Grid rows — one per niche */}
            {niches.map(niche => (
              <div key={niche} className="flex gap-0.5 mb-0.5">
                <div className="w-28 shrink-0 text-xs text-muted-foreground flex items-center truncate pr-1" title={niche}>
                  {truncate(niche, 18)}
                </div>
                {hours.map(hour => {
                  const cell = grid[`${niche}|${hour}`]
                  const total = cell?.total ?? 0
                  const rate = cell?.rate ?? 0
                  return (
                    <div
                      key={hour}
                      className={`flex-1 h-7 rounded-sm ${getColor(rate, total)} transition-colors cursor-default flex items-center justify-center`}
                      title={`${niche} à ${hour}h: ${total} appels, ${rate}% décrochage`}
                    >
                      {total > 0 && (
                        <span className="text-[9px] font-medium text-white/90 drop-shadow-sm">
                          {rate}%
                        </span>
                      )}
                    </div>
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
              <span className="ml-auto">Taux de contact (%) · min 5 appels</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
