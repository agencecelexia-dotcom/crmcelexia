import { useAuth } from '@/features/auth/hooks/use-auth'
import {
  useFunnelStats,
  useCallsToday,
  useCallsThisWeek,
  useRdvThisWeek,
  useRdvShowUpRate,
  useCommercialRanking,
  useWeeklyCallStats,
  useCommercialExtraStats,
} from '../hooks/use-dashboard'
import { useMyReminders } from '@/features/prospection/hooks/use-reminders'
import { useMyUpcomingRdv } from '@/features/rendez-vous/hooks/use-rdv'
import { usePerformanceStats, useDashboardComparisons, useKeyRates } from '@/features/analytics/hooks/use-analytics'
import { AlertsPanel } from '@/features/alerts/components/alerts-panel'
import { StatCard } from '@/components/shared/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useNavigate } from 'react-router-dom'
import { Phone, CalendarDays, CalendarCheck, Clock, AlertTriangle, TrendingUp, Users, Target, BarChart3, DollarSign, UserCheck, Percent } from 'lucide-react'
import { PROSPECT_STATUS_LABELS, PROSPECT_STATUS_COLORS, RDV_TYPE_LABELS } from '@/types/enums'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatDate, formatCurrency } from '@/lib/format'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'

const FUNNEL_COLORS: Record<string, string> = {
  nouveau: '#8B5CF6',
  messagerie: '#C4B5FD',
  site_en_attente: '#06B6D4',
  site_envoye: '#3B82F6',
  a_rappeler: '#7C3AED',
  rdv_pris: '#10B981',
  converti_client: '#059669',
  negatif: '#EF4444',
  perdu: '#F87171',
  faux_numero: '#F59E0B',
}

export function DashboardPage() {
  const { profile, isFounder } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Bienvenue, {profile?.full_name}
        </h1>
        <p className="text-muted-foreground">
          {isFounder ? 'Vue d\'ensemble de l\'agence' : 'Votre espace de travail'}
        </p>
      </div>

      {isFounder ? (
        <FounderDashboard />
      ) : (
        <CommercialDashboard commercialId={profile?.id} />
      )}
    </div>
  )
}

function CommercialDashboard({ commercialId }: { commercialId: string | undefined }) {
  const navigate = useNavigate()
  const { data: callsWeek, isLoading: loadingCalls } = useCallsThisWeek(commercialId)
  const { data: funnel } = useFunnelStats(commercialId)
  const { data: upcomingRdv } = useMyUpcomingRdv(commercialId)
  const { data: todayReminders } = useMyReminders(commercialId, { todayOnly: true })
  const { data: overdueReminders } = useMyReminders(commercialId, { overdueOnly: true })
  const { data: weeklyStats } = useWeeklyCallStats(commercialId)
  const { data: extraStats } = useCommercialExtraStats(commercialId)

  const rdvBookedMonth = extraStats?.rdv_booked_month ?? 0
  const rdvBookedWeek = extraStats?.rdv_booked_week ?? 0
  const callsMonth = extraStats?.calls_month ?? 0
  const signedClientsMonth = extraStats?.signed_clients_month ?? 0

  // Ratio: appels ce mois / RDV bookes ce mois
  const ratioCallsRdv = rdvBookedMonth > 0
    ? Math.round(callsMonth / rdvBookedMonth)
    : 0

  // Taux de conversion: RDV -> Client signe (ce mois)
  const conversionRate = rdvBookedMonth > 0
    ? Math.round((signedClientsMonth / rdvBookedMonth) * 1000) / 10
    : 0

  const funnelPieData = funnel ? [
    { name: 'Nouveau', value: funnel.nouveau, color: FUNNEL_COLORS.nouveau },
    { name: 'Messagerie', value: funnel.messagerie, color: FUNNEL_COLORS.messagerie },
    { name: 'Site en attente', value: funnel.site_en_attente, color: FUNNEL_COLORS.site_en_attente },
    { name: 'Site envoyé', value: funnel.site_envoye, color: FUNNEL_COLORS.site_envoye },
    { name: 'À rappeler', value: funnel.a_rappeler, color: FUNNEL_COLORS.a_rappeler },
    { name: 'RDV pris', value: funnel.rdv_pris, color: FUNNEL_COLORS.rdv_pris },
    { name: 'Converti', value: funnel.converti_client, color: FUNNEL_COLORS.converti_client },
  ].filter(d => d.value > 0) : []

  return (
    <>
      {/* KPI cards — 6 cold-caller stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Appels cette semaine"
          value={loadingCalls ? '...' : callsWeek ?? 0}
          subtitle={`${callsMonth} ce mois`}
          icon={Phone}
        />
        <StatCard
          title="RDV bookes ce mois"
          value={rdvBookedMonth}
          icon={CalendarCheck}
          className="border-emerald-400 bg-emerald-50/40 ring-1 ring-emerald-200"
        />
        <StatCard
          title="RDV bookes cette semaine"
          value={rdvBookedWeek}
          icon={CalendarDays}
        />
        <StatCard
          title="Ratio appels / RDV"
          value={rdvBookedMonth > 0 ? `${ratioCallsRdv} appels/RDV` : '-'}
          subtitle={rdvBookedMonth > 0 ? `${callsMonth} appels pour ${rdvBookedMonth} RDV` : 'Aucun RDV ce mois'}
          icon={BarChart3}
        />
        <StatCard
          title="Clients signes"
          value={signedClientsMonth}
          subtitle="Ce mois"
          icon={UserCheck}
          className={signedClientsMonth > 0 ? 'border-green-300 bg-green-50/30' : undefined}
        />
        <StatCard
          title="Taux de conversion"
          value={rdvBookedMonth > 0 ? `${conversionRate}%` : '-'}
          subtitle="RDV → Client signe"
          icon={Percent}
        />
      </div>

      {/* Smart Alerts */}
      <AlertsPanel />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Overdue reminders */}
        {overdueReminders && overdueReminders.length > 0 && (
          <Card className="border-red-200 bg-red-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-4 w-4" />
                Rappels en retard ({overdueReminders.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {overdueReminders.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border border-red-200 bg-white p-2.5 cursor-pointer hover:bg-red-50 transition-colors"
                    onClick={() => navigate(`/prospects/${r.prospect_id}`)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.prospect?.company_name}</p>
                      <p className="text-xs text-red-600">{formatDate(r.remind_at)}</p>
                    </div>
                    {r.note && <p className="text-xs text-muted-foreground truncate ml-2 max-w-[120px]">{r.note}</p>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Today's reminders */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Rappels aujourd'hui ({todayReminders?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!todayReminders || todayReminders.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Aucun rappel aujourd'hui</p>
            ) : (
              <div className="space-y-2">
                {todayReminders.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border p-2.5 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => navigate(`/prospects/${r.prospect_id}`)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.prospect?.company_name}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(r.remind_at)}</p>
                    </div>
                    {r.note && <p className="text-xs text-muted-foreground truncate ml-2 max-w-[120px]">{r.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming RDV */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Prochains RDV
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!upcomingRdv || upcomingRdv.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Aucun RDV à venir</p>
            ) : (
              <div className="space-y-2">
                {upcomingRdv.slice(0, 5).map((rdv) => (
                  <div
                    key={rdv.id}
                    className="flex items-center justify-between rounded-lg border p-2.5 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => navigate(`/prospects/${rdv.prospect_id}`)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{rdv.prospect?.company_name}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(rdv.scheduled_at)}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {RDV_TYPE_LABELS[rdv.type]}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weekly calls chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Mes appels par semaine
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!weeklyStats ? (
              <Skeleton className="h-48" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weeklyStats} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                    }}
                    formatter={(value) => [String(value ?? 0), 'Appels']}
                  />
                  <Bar dataKey="count" fill="#7C3AED" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Mini funnel pie */}
        {funnel && funnelPieData.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Mon funnel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie
                      data={funnelPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {funnelPieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [String(value ?? 0), String(name)]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {([
                    ['nouveau', funnel.nouveau],
                    ['messagerie', funnel.messagerie],
                    ['site_en_attente', funnel.site_en_attente],
                    ['site_envoye', funnel.site_envoye],
                    ['a_rappeler', funnel.a_rappeler],
                    ['rdv_pris', funnel.rdv_pris],
                    ['converti_client', funnel.converti_client],
                  ] as const).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between text-sm">
                      <StatusBadge
                        label={PROSPECT_STATUS_LABELS[status]}
                        colorClass={PROSPECT_STATUS_COLORS[status]}
                      />
                      <span className="font-semibold tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}

function FounderDashboard() {
  const navigate = useNavigate()
  const { data: callsToday } = useCallsToday()
  const { data: callsWeek } = useCallsThisWeek()
  const { data: rdvWeek } = useRdvThisWeek()
  const { data: showUpRate } = useRdvShowUpRate()
  const { data: funnel } = useFunnelStats()
  const { data: ranking, isLoading: loadingRanking } = useCommercialRanking()
  const { data: weeklyStats } = useWeeklyCallStats()
  const { data: perfStats } = usePerformanceStats()
  const { data: comparisons } = useDashboardComparisons()
  const { data: keyRates } = useKeyRates()

  const funnelBarData = funnel ? [
    { name: 'Nouveau', value: funnel.nouveau, fill: FUNNEL_COLORS.nouveau },
    { name: 'Messagerie', value: funnel.messagerie, fill: FUNNEL_COLORS.messagerie },
    { name: 'Site en attente', value: funnel.site_en_attente, fill: FUNNEL_COLORS.site_en_attente },
    { name: 'Site envoyé', value: funnel.site_envoye, fill: FUNNEL_COLORS.site_envoye },
    { name: 'À rappeler', value: funnel.a_rappeler, fill: FUNNEL_COLORS.a_rappeler },
    { name: 'RDV pris', value: funnel.rdv_pris, fill: FUNNEL_COLORS.rdv_pris },
    { name: 'Converti', value: funnel.converti_client, fill: FUNNEL_COLORS.converti_client },
    { name: 'Négatif', value: funnel.negatif, fill: FUNNEL_COLORS.negatif },
    { name: 'Perdu', value: funnel.perdu, fill: FUNNEL_COLORS.perdu },
    { name: 'Faux numéro', value: funnel.faux_numero, fill: FUNNEL_COLORS.faux_numero },
  ] : []

  const conversionRate = funnel && funnel.total_prospects > 0
    ? ((funnel.converti_client / funnel.total_prospects) * 100).toFixed(1)
    : '0'

  const rdvRate = funnel && funnel.total_prospects > 0
    ? ((funnel.rdv_pris / funnel.total_prospects) * 100).toFixed(1)
    : '0'

  return (
    <>
      {/* Global KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <StatCard
          title="CA ce mois"
          value={perfStats ? formatCurrency(perfStats.ca_this_month) : '...'}
          subtitle={perfStats ? `MRR: ${formatCurrency(perfStats.mrr_generated)}` : ''}
          icon={DollarSign}
          trend={comparisons?.ca_delta != null ? { value: comparisons.ca_delta, label: 'vs mois préc.' } : undefined}
          className="border-primary/30 bg-primary/5"
        />
        <StatCard
          title="Appels aujourd'hui"
          value={callsToday ?? 0}
          subtitle={`${callsWeek ?? 0} cette semaine`}
          icon={Phone}
          trend={comparisons?.calls_delta != null ? { value: comparisons.calls_delta, label: 'vs mois préc.' } : undefined}
        />
        <StatCard
          title="RDV cette semaine"
          value={rdvWeek ?? 0}
          subtitle={`${rdvRate}% taux de prise RDV`}
          icon={CalendarDays}
          trend={comparisons?.rdv_delta != null ? { value: comparisons.rdv_delta, label: 'vs mois préc.' } : undefined}
        />
        <StatCard
          title="Taux de show-up"
          value={showUpRate !== undefined ? `${showUpRate}%` : '...'}
          subtitle="Ce mois-ci"
          icon={TrendingUp}
        />
        <StatCard
          title="Taux de contact"
          value={keyRates ? `${keyRates.contact_rate}%` : '...'}
          subtitle={keyRates ? `${keyRates.call_to_rdv_rate}% → RDV` : ''}
          icon={UserCheck}
        />
        <StatCard
          title="Total prospects"
          value={funnel?.total_prospects ?? 0}
          subtitle={`${conversionRate}% taux de conversion`}
          icon={Users}
        />
      </div>

      {/* Smart Alerts */}
      <AlertsPanel />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Funnel bar chart */}
        {funnel && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Funnel global — Répartition des prospects
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={funnelBarData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={50} stroke="#9ca3af" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                    }}
                    formatter={(value) => {
                      const v = Number(value ?? 0)
                      const pct = funnel.total_prospects > 0 ? ((v / funnel.total_prospects) * 100).toFixed(1) : 0
                      return [`${v} (${pct}%)`, 'Prospects']
                    }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {funnelBarData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Weekly calls chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Appels par semaine
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!weeklyStats ? (
              <Skeleton className="h-48" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyStats} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                  <defs>
                    <linearGradient id="violetGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity={1} />
                      <stop offset="100%" stopColor="#7C3AED" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                    }}
                    formatter={(value) => [String(value ?? 0), 'Appels']}
                  />
                  <Bar dataKey="count" fill="url(#violetGrad)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Commercial ranking */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Classement commerciaux (ce mois)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingRanking ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : !ranking || ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Aucune donnée</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead className="text-right">Appels</TableHead>
                    <TableHead className="text-right">RDV</TableHead>
                    <TableHead className="text-right">Conv.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-bold text-primary">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium">{r.full_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.calls_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.rdv_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.conversion_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick access */}
      <div className="flex gap-2 sm:gap-3 flex-wrap">
        <Button size="sm" onClick={() => navigate('/prospects')}>
          Voir les prospects
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/rdv')}>
          Voir les RDV
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/clients')}>
          Voir les clients
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/calendar')}>
          Calendrier
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/opportunities')}>
          Opportunités
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/performance')}>
          Performance
        </Button>
      </div>
    </>
  )
}
