import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { usePerformanceStats, useKeyRates, useCommercialClosingRates, useLossReasonStats, useCATrend } from '../hooks/use-analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/shared/stat-card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DollarSign,
  TrendingUp,
  Target,
  ShoppingCart,
  Repeat,
  BarChart3,
  Phone,
  Calendar,
  Users,
  UserCheck,
} from 'lucide-react'
import { formatCurrency, formatPercentage } from '@/lib/format'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, AreaChart, Area,
} from 'recharts'
import { CallHeatmap } from '../components/call-heatmap'
import { NichePerformance } from '../components/niche-performance'

const LOSS_COLORS = ['#EF4444', '#F97316', '#F59E0B', '#6B7280', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#64748B', '#A855F7']

type Period = 'this_month' | 'last_month' | 'this_quarter' | 'last_3_months'
const PERIOD_LABELS: Record<Period, string> = {
  this_month: 'Ce mois',
  last_month: 'Mois dernier',
  this_quarter: 'Ce trimestre',
  last_3_months: '3 derniers mois',
}

export function PerformancePage() {
  const { profile, isFounder } = useAuth()
  const commercialId = isFounder ? undefined : profile?.id
  const [period, setPeriod] = useState<Period>('this_month')

  const { data: perfStats, isLoading: loadingPerf } = usePerformanceStats(commercialId)
  const { data: keyRates, isLoading: loadingRates } = useKeyRates(commercialId)
  const { data: closingRates, isLoading: loadingClosing } = useCommercialClosingRates()
  const { data: lossReasons, isLoading: loadingLoss } = useLossReasonStats(commercialId)
  const { data: caTrend } = useCATrend(commercialId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Performance Commerciale</h1>
          <p className="text-muted-foreground">
            {isFounder ? 'Vue globale des performances de l\'équipe' : 'Vos indicateurs de performance'}
          </p>
        </div>
        {/* Period selector */}
        <div className="flex gap-1">
          {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([key, label]) => (
            <Button
              key={key}
              variant={period === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod(key)}
              className="text-xs"
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Performance KPIs */}
      {loadingPerf ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : perfStats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <StatCard
            title="CA généré"
            value={formatCurrency(perfStats.ca_generated)}
            icon={DollarSign}
          />
          <StatCard
            title="CA ce mois"
            value={formatCurrency(perfStats.ca_this_month)}
            icon={TrendingUp}
            className="border-primary/30 bg-primary/5"
          />
          <StatCard
            title="Taux de closing"
            value={formatPercentage(perfStats.closing_rate)}
            subtitle={`${perfStats.deals_won} gagnés / ${perfStats.deals_lost} perdus`}
            icon={Target}
          />
          <StatCard
            title="Panier moyen"
            value={formatCurrency(perfStats.average_basket)}
            icon={ShoppingCart}
          />
          <StatCard
            title="MRR généré"
            value={formatCurrency(perfStats.mrr_generated)}
            subtitle="Mensuel récurrent"
            icon={Repeat}
          />
        </div>
      )}

      {/* Key Rates */}
      {loadingRates ? (
        <Skeleton className="h-32" />
      ) : keyRates && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Taux clés du mois
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-5">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Phone className="h-4 w-4 text-blue-500" />
                  <span className="text-sm text-muted-foreground">Appel &rarr; RDV</span>
                </div>
                <p className="text-3xl font-bold text-blue-600">{formatPercentage(keyRates.call_to_rdv_rate)}</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-purple-500" />
                  <span className="text-sm text-muted-foreground">RDV &rarr; Closing</span>
                </div>
                <p className="text-3xl font-bold text-purple-600">{formatPercentage(keyRates.rdv_to_closing_rate)}</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Target className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-muted-foreground">Closing global</span>
                </div>
                <p className="text-3xl font-bold text-green-600">{formatPercentage(keyRates.global_closing_rate)}</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <UserCheck className="h-4 w-4 text-teal-500" />
                  <span className="text-sm text-muted-foreground">Taux de contact</span>
                </div>
                <p className="text-3xl font-bold text-teal-600">{formatPercentage(keyRates.contact_rate)}</p>
                <p className="text-xs text-muted-foreground">décrochage / appels</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Phone className="h-4 w-4 text-orange-500" />
                  <span className="text-sm text-muted-foreground">Appels / conversion</span>
                </div>
                <p className="text-3xl font-bold text-orange-600">{keyRates.cac.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">nb moyen d'appels pour convertir</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* CA Trend (12 months) */}
      {caTrend && caTrend.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Évolution du CA — 12 derniers mois
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={caTrend} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="caGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#7C3AED" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" tickFormatter={v => `${(Number(v) / 1000).toFixed(0)}k€`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px' }}
                  formatter={(value) => [formatCurrency(Number(value)), 'CA']}
                />
                <Area type="monotone" dataKey="ca" stroke="#7C3AED" strokeWidth={2} fill="url(#caGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Heatmap + Niche performance */}
      <div className="grid gap-6 md:grid-cols-2">
        <CallHeatmap commercialId={commercialId} />
        <NichePerformance commercialId={commercialId} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Commercial Closing Rates */}
        {isFounder && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Taux de closing par commercial
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingClosing ? (
                <Skeleton className="h-48" />
              ) : !closingRates?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Aucune donnée</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Commercial</TableHead>
                      <TableHead className="text-right">Appels</TableHead>
                      <TableHead className="text-right">RDV</TableHead>
                      <TableHead className="text-right">Convertis</TableHead>
                      <TableHead className="text-right">Perdus</TableHead>
                      <TableHead className="text-right">Taux closing</TableHead>
                      <TableHead className="text-right">Appel &rarr; RDV</TableHead>
                      <TableHead className="text-right">RDV &rarr; Closing</TableHead>
                      <TableHead className="text-right">CA généré</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closingRates.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.full_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.calls_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.rdv_count}</TableCell>
                        <TableCell className="text-right tabular-nums text-green-600 font-semibold">{c.converted}</TableCell>
                        <TableCell className="text-right tabular-nums text-red-600">{c.lost}</TableCell>
                        <TableCell className="text-right tabular-nums font-bold">
                          <span className={c.closing_rate >= 20 ? 'text-green-600' : c.closing_rate >= 10 ? 'text-yellow-600' : 'text-red-600'}>
                            {formatPercentage(c.closing_rate)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercentage(c.call_to_rdv_rate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercentage(c.rdv_to_closing_rate)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(c.ca_generated)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Loss Reasons */}
        <Card className={isFounder ? '' : 'md:col-span-2'}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Raisons de perte</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingLoss ? (
              <Skeleton className="h-48" />
            ) : !lossReasons?.length ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Aucune donnée de perte</p>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={lossReasons.map((r, i) => ({ name: r.label, value: r.count, color: LOSS_COLORS[i % LOSS_COLORS.length] }))} cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={2} dataKey="value">
                      {lossReasons.map((_, i) => (
                        <Cell key={i} fill={LOSS_COLORS[i % LOSS_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${value} (${lossReasons.find(r => r.label === name)?.percentage ?? 0}%)`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {lossReasons.slice(0, 8).map((r, i) => (
                    <div key={r.reason} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LOSS_COLORS[i % LOSS_COLORS.length] }} />
                        <span>{r.label}</span>
                      </div>
                      <span className="font-semibold tabular-nums">{r.count} ({r.percentage}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* CA Generated bar chart if founder */}
        {isFounder && closingRates && closingRates.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">CA par commercial</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={closingRates.map(c => ({ name: c.full_name.split(' ')[0], ca: c.ca_generated }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(Number(v) / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value) => [formatCurrency(Number(value)), 'CA']} />
                  <Bar dataKey="ca" fill="#7C3AED" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
