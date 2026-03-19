import { useAuth } from '@/features/auth/hooks/use-auth'
import { usePipelineStats } from '../hooks/use-opportunities'
import { StatCard } from '@/components/shared/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import { OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_STAGE_HEX, type OpportunityStatus, type OpportunityType } from '@/types/enums'
import { DollarSign, Trophy, Clock, TrendingUp } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

interface PipelineDashboardProps {
  opportunityType?: OpportunityType
}

export function PipelineDashboard({ opportunityType }: PipelineDashboardProps) {
  const { profile, isFounder } = useAuth()
  const commercialId = isFounder ? undefined : profile?.id
  const { data: pipeline } = usePipelineStats(commercialId, opportunityType)

  if (!pipeline) return null

  const chartData = pipeline.by_stage.map(s => ({
    name: OPPORTUNITY_STATUS_LABELS[s.stage as OpportunityStatus] ?? s.stage,
    total_price: s.total_price,
    count: s.count,
    fill: OPPORTUNITY_STAGE_HEX[s.stage as OpportunityStatus] ?? '#6B7280',
  }))

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Potentiel pipeline"
          value={formatCurrency(pipeline.active_pipeline)}
          subtitle={`${pipeline.active_count} opportunités en cours`}
          icon={DollarSign}
        />
        <StatCard
          title="Close"
          value={`${pipeline.won_count} deals`}
          subtitle={formatCurrency(pipeline.won_total)}
          icon={Trophy}
        />
        <StatCard
          title="Encaissé (Close)"
          value={formatCurrency(pipeline.close_collected)}
          icon={TrendingUp}
        />
        <StatCard
          title="En attente versement"
          value={formatCurrency(pipeline.close_pending)}
          subtitle={pipeline.won_count > 0 ? `${pipeline.won_count} close, ${Math.round((pipeline.close_collected / (pipeline.won_total || 1)) * 100)}% encaissé` : undefined}
          icon={Clock}
        />
      </div>

      {/* Pipeline chart */}
      {chartData.length > 0 && chartData.some(d => d.count > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pipeline par étape</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(Number(v) / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value)), 'Montant']}
                  labelFormatter={(label) => `${label}`}
                />
                <Bar dataKey="total_price" radius={[6, 6, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
