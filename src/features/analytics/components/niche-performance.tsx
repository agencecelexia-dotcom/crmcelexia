import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePerformanceByNiche } from '../hooks/use-analytics'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { PieChart as PieIcon } from 'lucide-react'

export function NichePerformance({ commercialId }: { commercialId?: string }) {
  const { data: niches, isLoading } = usePerformanceByNiche(commercialId)

  if (isLoading) return <Skeleton className="h-64" />

  if (!niches || niches.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PieIcon className="h-4 w-4 text-primary" />
            Performance par niche
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4 text-center">
            Pas assez de données (min. 5 appels par niche)
          </p>
        </CardContent>
      </Card>
    )
  }

  const chartData = niches.slice(0, 10).map(n => ({
    name: n.niche.length > 18 ? n.niche.slice(0, 16) + '…' : n.niche,
    fullName: n.niche,
    'Taux contact': n.contact_rate,
    'Taux RDV': n.rdv_rate,
    appels: n.total_calls,
  }))

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <PieIcon className="h-4 w-4 text-primary" />
          Performance par niche
        </CardTitle>
        <p className="text-xs text-muted-foreground">Top 10 niches · 3 derniers mois · min. 5 appels</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
            <XAxis type="number" tick={{ fontSize: 11 }} unit="%" domain={[0, 'auto']} />
            <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value, name, props) => {
                const payload = props?.payload
                return [`${value}% (${payload?.appels ?? 0} appels)`, name]
              }}
              labelFormatter={(label) => {
                const item = chartData.find(d => d.name === label)
                return item?.fullName || label
              }}
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px' }}
            />
            <Bar dataKey="Taux contact" fill="#7C3AED" radius={[0, 4, 4, 0]} barSize={14} />
            <Bar dataKey="Taux RDV" fill="#10B981" radius={[0, 4, 4, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
