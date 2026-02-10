import { useAuth } from '@/features/auth/hooks/use-auth'
import {
  useFunnelStats,
  useCallsToday,
  useCallsThisWeek,
  useRdvThisWeek,
  useRdvShowUpRate,
  useRemindersCount,
  useCommercialRanking,
  useWeeklyCallStats,
} from '../hooks/use-dashboard'
import { useMyReminders } from '@/features/prospection/hooks/use-reminders'
import { useMyUpcomingRdv } from '@/features/rendez-vous/hooks/use-rdv'
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
import { Phone, CalendarDays, Clock, AlertTriangle, TrendingUp, Users, Target, BarChart3 } from 'lucide-react'
import { PROSPECT_STATUS_LABELS, PROSPECT_STATUS_COLORS, RDV_TYPE_LABELS } from '@/types/enums'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function DashboardPage() {
  const { profile, isFounder } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
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
  const { data: callsToday, isLoading: loadingCalls } = useCallsToday(commercialId)
  const { data: callsWeek } = useCallsThisWeek(commercialId)
  const { data: rdvWeek } = useRdvThisWeek(commercialId)
  const { data: reminders } = useRemindersCount(commercialId)
  const { data: funnel } = useFunnelStats(commercialId)
  const { data: upcomingRdv } = useMyUpcomingRdv(commercialId)
  const { data: todayReminders } = useMyReminders(commercialId, { todayOnly: true })
  const { data: overdueReminders } = useMyReminders(commercialId, { overdueOnly: true })

  return (
    <>
      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Appels aujourd'hui"
          value={loadingCalls ? '...' : callsToday ?? 0}
          subtitle={`${callsWeek ?? 0} cette semaine`}
          icon={Phone}
        />
        <StatCard
          title="Rappels du jour"
          value={reminders?.today ?? 0}
          subtitle={reminders?.overdue ? `${reminders.overdue} en retard` : 'Aucun en retard'}
          icon={Clock}
          className={reminders?.overdue ? 'border-orange-200' : undefined}
        />
        <StatCard
          title="RDV cette semaine"
          value={rdvWeek ?? 0}
          icon={CalendarDays}
        />
        <StatCard
          title="Prospects actifs"
          value={funnel?.total_prospects ?? 0}
          subtitle={funnel ? `${funnel.rdv_pris} RDV pris · ${funnel.converti_client} convertis` : ''}
          icon={Target}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Overdue reminders */}
        {overdueReminders && overdueReminders.length > 0 && (
          <Card className="border-red-200">
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
                    className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-2 cursor-pointer hover:bg-red-100 transition-colors"
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
              <Clock className="h-4 w-4" />
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
                    className="flex items-center justify-between rounded-md border p-2 cursor-pointer hover:bg-muted/50 transition-colors"
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
              <CalendarDays className="h-4 w-4" />
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
                    className="flex items-center justify-between rounded-md border p-2 cursor-pointer hover:bg-muted/50 transition-colors"
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

        {/* Mini funnel */}
        {funnel && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Mon funnel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {([
                  ['nouveau', funnel.nouveau],
                  ['appele_sans_reponse', funnel.appele_sans_reponse],
                  ['messagerie', funnel.messagerie],
                  ['interesse', funnel.interesse],
                  ['a_rappeler', funnel.a_rappeler],
                  ['rdv_pris', funnel.rdv_pris],
                  ['converti_client', funnel.converti_client],
                ] as const).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <StatusBadge
                      label={PROSPECT_STATUS_LABELS[status]}
                      colorClass={PROSPECT_STATUS_COLORS[status]}
                    />
                    <span className="font-medium text-sm">{count}</span>
                  </div>
                ))}
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

  return (
    <>
      {/* Global KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Appels aujourd'hui"
          value={callsToday ?? 0}
          subtitle={`${callsWeek ?? 0} cette semaine`}
          icon={Phone}
        />
        <StatCard
          title="RDV cette semaine"
          value={rdvWeek ?? 0}
          icon={CalendarDays}
        />
        <StatCard
          title="Taux de show-up"
          value={showUpRate !== undefined ? `${showUpRate} %` : '...'}
          subtitle="Ce mois-ci"
          icon={TrendingUp}
        />
        <StatCard
          title="Total prospects"
          value={funnel?.total_prospects ?? 0}
          subtitle={funnel ? `${funnel.converti_client} convertis` : ''}
          icon={Users}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Funnel overview */}
        {funnel && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Funnel global
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {([
                  ['nouveau', funnel.nouveau],
                  ['appele_sans_reponse', funnel.appele_sans_reponse],
                  ['messagerie', funnel.messagerie],
                  ['interesse', funnel.interesse],
                  ['a_rappeler', funnel.a_rappeler],
                  ['rdv_pris', funnel.rdv_pris],
                  ['converti_client', funnel.converti_client],
                  ['negatif', funnel.negatif],
                  ['perdu', funnel.perdu],
                ] as const).map(([status, count]) => {
                  const pct = funnel.total_prospects > 0 ? (count / funnel.total_prospects) * 100 : 0
                  return (
                    <div key={status} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <StatusBadge
                          label={PROSPECT_STATUS_LABELS[status]}
                          colorClass={PROSPECT_STATUS_COLORS[status]}
                        />
                        <span className="font-medium">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            status === 'converti_client' ? 'bg-emerald-500' :
                            status === 'negatif' || status === 'perdu' ? 'bg-red-400' :
                            status === 'rdv_pris' ? 'bg-green-500' :
                            status === 'interesse' ? 'bg-blue-500' :
                            'bg-primary/60'
                          )}
                          style={{ width: `${Math.max(pct, 1)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Commercial ranking */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
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
                    <TableHead>#</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead className="text-right">Appels</TableHead>
                    <TableHead className="text-right">RDV</TableHead>
                    <TableHead className="text-right">Conv.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </TableCell>
                      <TableCell className="font-medium">{r.full_name}</TableCell>
                      <TableCell className="text-right">{r.calls_count}</TableCell>
                      <TableCell className="text-right">{r.rdv_count}</TableCell>
                      <TableCell className="text-right">{r.conversion_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Weekly calls chart (bar) */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Appels par semaine
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!weeklyStats ? (
              <Skeleton className="h-32" />
            ) : (
              <div className="flex items-end gap-2 h-32">
                {weeklyStats.map((w) => {
                  const maxCount = Math.max(...weeklyStats.map((s) => s.count), 1)
                  const height = (w.count / maxCount) * 100
                  return (
                    <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs font-medium">{w.count}</span>
                      <div
                        className="w-full bg-primary/80 rounded-t transition-all"
                        style={{ height: `${Math.max(height, 4)}%` }}
                      />
                      <span className="text-xs text-muted-foreground">{w.week}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick access */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate('/prospects')}>
          Voir les prospects
        </Button>
        <Button variant="outline" onClick={() => navigate('/rdv')}>
          Voir les RDV
        </Button>
        <Button variant="outline" onClick={() => navigate('/clients')}>
          Voir les clients
        </Button>
      </div>
    </>
  )
}
