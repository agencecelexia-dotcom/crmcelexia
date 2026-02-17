import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useRendezVous, useUpdateRdv } from '../hooks/use-rdv'
import type { RdvFilters } from '../services/rdv-service'
import type { RendezVous } from '@/types'
import type { RdvStatus, RdvType } from '@/types/enums'
import { RDV_STATUS_LABELS, RDV_STATUS_COLORS, RDV_TYPE_LABELS } from '@/types/enums'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatPhone } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  CalendarDays,
  Phone,
  Video,
  MapPin,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  CalendarCheck,
  UserX,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  format,
  isToday,
  isTomorrow,
  isThisWeek,
  isPast,
  parseISO,
  startOfDay,
  addDays,
} from 'date-fns'
import { fr } from 'date-fns/locale'

const typeIcons: Record<RdvType, typeof Phone> = {
  telephone: Phone,
  visio: Video,
  presentiel: MapPin,
}

type TabFilter = 'today' | 'week' | 'upcoming' | 'past' | 'all'

export function RdvListPage() {
  const navigate = useNavigate()
  const { isFounder } = useAuth()
  const updateRdv = useUpdateRdv()

  const [tab, setTab] = useState<TabFilter>('upcoming')
  const [typeFilter, setTypeFilter] = useState<RdvType | 'all'>('all')
  const [page, setPage] = useState(1)

  // Result dialog state
  const [resultRdv, setResultRdv] = useState<RendezVous | null>(null)
  const [resultText, setResultText] = useState('')
  const [noShowReason, setNoShowReason] = useState('')

  // Build filters based on active tab
  const filters: RdvFilters = useMemo(() => {
    const f: RdvFilters = {}
    if (typeFilter !== 'all') f.type = [typeFilter]

    const now = new Date()
    const todayStart = startOfDay(now).toISOString()
    const tomorrowStart = startOfDay(addDays(now, 1)).toISOString()
    const weekEnd = startOfDay(addDays(now, 7)).toISOString()

    switch (tab) {
      case 'today':
        f.date_from = todayStart
        f.date_to = tomorrowStart
        f.status = ['prevu']
        break
      case 'week':
        f.date_from = todayStart
        f.date_to = weekEnd
        f.status = ['prevu']
        break
      case 'upcoming':
        f.date_from = todayStart
        f.status = ['prevu']
        break
      case 'past':
        f.status = ['fait', 'no_show', 'annule']
        break
      case 'all':
        break
    }
    return f
  }, [tab, typeFilter])

  const { data, isLoading } = useRendezVous({
    filters,
    page,
    sortBy: 'scheduled_at',
    sortDesc: tab === 'past',
  })

  const rdvs = data?.data ?? []

  // Compute stats from current data
  const todayCount = rdvs.filter((r) => r.status === 'prevu' && isToday(parseISO(r.scheduled_at))).length
  const overdueCount = rdvs.filter(
    (r) => r.status === 'prevu' && isPast(parseISO(r.scheduled_at))
  ).length
  const thisWeekCount = rdvs.filter(
    (r) => r.status === 'prevu' && isThisWeek(parseISO(r.scheduled_at), { weekStartsOn: 1 })
  ).length

  async function quickStatusChange(rdvId: string, newStatus: RdvStatus) {
    try {
      const updates: Record<string, unknown> = { status: newStatus }
      if (newStatus === 'fait') {
        updates.result = 'Fait'
      }
      await updateRdv.mutateAsync({ id: rdvId, updates: updates as never })
      toast.success('Statut mis à jour')
    } catch {
      toast.error('Erreur')
    }
  }

  async function handleMarkDone() {
    if (!resultRdv) return
    try {
      await updateRdv.mutateAsync({
        id: resultRdv.id,
        updates: {
          status: 'fait',
          result: resultText.trim() || 'Fait',
        } as never,
      })
      toast.success('RDV marqué comme fait')
      setResultRdv(null)
      setResultText('')
    } catch {
      toast.error('Erreur')
    }
  }

  async function handleMarkNoShow() {
    if (!resultRdv) return
    try {
      await updateRdv.mutateAsync({
        id: resultRdv.id,
        updates: {
          status: 'no_show',
          no_show_reason: noShowReason.trim() || null,
        } as never,
      })
      toast.success('RDV marqué no-show')
      setResultRdv(null)
      setNoShowReason('')
    } catch {
      toast.error('Erreur')
    }
  }

  // Group RDVs by date for better readability
  const groupedRdvs = useMemo(() => {
    const groups: { label: string; rdvs: RendezVous[] }[] = []
    const map = new Map<string, RendezVous[]>()

    for (const rdv of rdvs) {
      const date = parseISO(rdv.scheduled_at)
      let key: string
      if (isToday(date)) key = "Aujourd'hui"
      else if (isTomorrow(date)) key = 'Demain'
      else key = format(date, 'EEEE d MMMM', { locale: fr })

      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(rdv)
    }

    for (const [label, rdvList] of map) {
      groups.push({ label, rdvs: rdvList })
    }

    return groups
  }, [rdvs])

  const TABS: { value: TabFilter; label: string; count?: number }[] = [
    { value: 'today', label: "Aujourd'hui", count: todayCount },
    { value: 'week', label: 'Cette semaine', count: thisWeekCount },
    { value: 'upcoming', label: 'À venir' },
    { value: 'past', label: 'Passés' },
    { value: 'all', label: 'Tous' },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Rendez-vous</h1>
        <p className="text-sm text-muted-foreground">
          Gérez et suivez vos rendez-vous
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setTab('today')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <CalendarDays className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{todayCount}</p>
                <p className="text-xs text-muted-foreground">Aujourd'hui</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setTab('week')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50">
                <CalendarCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{thisWeekCount}</p>
                <p className="text-xs text-muted-foreground">Cette semaine</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-50">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overdueCount}</p>
                <p className="text-xs text-muted-foreground">En retard</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50">
                <Clock className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data?.count ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total affiché</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs + Type filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border bg-muted/30 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => { setTab(t.value); setPage(1) }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                tab === t.value
                  ? 'bg-background shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center bg-primary/10 text-primary text-xs rounded-full px-1.5 min-w-[18px]">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as RdvType | 'all'); setPage(1) }}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {(Object.entries(RDV_TYPE_LABELS) as [RdvType, string][]).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* RDV List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : rdvs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CalendarDays className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Aucun rendez-vous</p>
            <p className="text-sm text-muted-foreground mt-1">
              {tab === 'today'
                ? "Pas de RDV aujourd'hui"
                : tab === 'week'
                ? 'Rien de prévu cette semaine'
                : 'Les RDV apparaîtront ici quand vous en créerez depuis les fiches prospects.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedRdvs.map((group) => (
            <div key={group.label}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2 capitalize">
                {group.label}
              </h3>
              <div className="space-y-2">
                {group.rdvs.map((rdv) => {
                  const date = parseISO(rdv.scheduled_at)
                  const isPastPrevu = rdv.status === 'prevu' && isPast(date)
                  const TypeIcon = typeIcons[rdv.type]

                  return (
                    <Card
                      key={rdv.id}
                      className={`transition-colors hover:border-primary/30 ${
                        isPastPrevu ? 'border-orange-300 bg-orange-50/30' : ''
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          {/* Left: Time + Type + Prospect info */}
                          <div className="flex items-start gap-4 min-w-0 flex-1">
                            {/* Time block */}
                            <div className="text-center shrink-0 w-16">
                              <p className="text-2xl font-bold tabular-nums">
                                {format(date, 'HH:mm')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {rdv.duration_minutes} min
                              </p>
                            </div>

                            {/* Type icon */}
                            <div className={`p-2 rounded-lg shrink-0 ${
                              rdv.type === 'telephone' ? 'bg-blue-50' :
                              rdv.type === 'visio' ? 'bg-purple-50' : 'bg-green-50'
                            }`}>
                              <TypeIcon className={`h-5 w-5 ${
                                rdv.type === 'telephone' ? 'text-blue-600' :
                                rdv.type === 'visio' ? 'text-purple-600' : 'text-green-600'
                              }`} />
                            </div>

                            {/* Prospect info */}
                            <div className="min-w-0">
                              <button
                                onClick={() => navigate(`/prospects/${rdv.prospect_id}`)}
                                className="font-semibold text-left hover:text-primary hover:underline truncate block"
                              >
                                {rdv.prospect?.company_name ?? 'Prospect'}
                              </button>
                              <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground">
                                {rdv.prospect?.contact_firstname && (
                                  <span>
                                    {rdv.prospect.contact_firstname} {rdv.prospect.contact_name}
                                  </span>
                                )}
                                {rdv.prospect?.phone && (
                                  <a
                                    href={`tel:${rdv.prospect.phone}`}
                                    className="font-mono text-primary hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {formatPhone(rdv.prospect.phone)}
                                  </a>
                                )}
                              </div>
                              {rdv.notes && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{rdv.notes}</p>
                              )}
                              {rdv.result && rdv.status === 'fait' && (
                                <p className="text-xs text-green-700 mt-1 line-clamp-1">
                                  Résultat: {rdv.result}
                                </p>
                              )}
                              {isFounder && rdv.commercial?.full_name && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {rdv.commercial.full_name}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Right: Status + Actions */}
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <StatusBadge
                              label={RDV_STATUS_LABELS[rdv.status]}
                              colorClass={RDV_STATUS_COLORS[rdv.status]}
                            />
                            {isPastPrevu && (
                              <span className="text-xs text-orange-600 font-medium flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                En retard
                              </span>
                            )}

                            {rdv.status === 'prevu' && (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setResultRdv(rdv)
                                    setResultText('')
                                    setNoShowReason('')
                                  }}
                                  title="Résultat du RDV"
                                >
                                  <CheckCircle2 className="h-4 w-4 text-green-600 mr-1" />
                                  <span className="text-xs">Fait</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setResultRdv(rdv)
                                    setResultText('')
                                    setNoShowReason('')
                                  }}
                                  title="No-show"
                                >
                                  <UserX className="h-4 w-4 text-red-500" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    quickStatusChange(rdv.id, 'annule')
                                  }}
                                  title="Annuler"
                                >
                                  <XCircle className="h-4 w-4 text-gray-500" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {data.count} rendez-vous — page {data.page}/{data.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Result Dialog */}
      <Dialog open={!!resultRdv} onOpenChange={(open) => { if (!open) setResultRdv(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Résultat du RDV</DialogTitle>
          </DialogHeader>

          {resultRdv && (
            <div className="space-y-4 py-2">
              {/* RDV info */}
              <div className="rounded-lg bg-muted p-3">
                <p className="font-medium">{resultRdv.prospect?.company_name}</p>
                <p className="text-sm text-muted-foreground">
                  {format(parseISO(resultRdv.scheduled_at), "EEEE d MMMM 'à' HH:mm", { locale: fr })}
                  {' — '}
                  {RDV_TYPE_LABELS[resultRdv.type]}
                </p>
              </div>

              {/* Mark as done */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Marquer comme fait
                </h4>
                <Textarea
                  value={resultText}
                  onChange={(e) => setResultText(e.target.value)}
                  placeholder="Qu'est-ce qui a été discuté ? Prochaines étapes ?"
                  rows={3}
                  className="text-sm"
                />
                <Button onClick={handleMarkDone} disabled={updateRdv.isPending} className="w-full">
                  {updateRdv.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  RDV effectué
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">ou</span>
                </div>
              </div>

              {/* Mark as no-show */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <UserX className="h-4 w-4 text-red-500" />
                  No-show
                </h4>
                <Input
                  value={noShowReason}
                  onChange={(e) => setNoShowReason(e.target.value)}
                  placeholder="Raison (optionnelle)..."
                  className="text-sm"
                />
                <Button
                  variant="outline"
                  onClick={handleMarkNoShow}
                  disabled={updateRdv.isPending}
                  className="w-full text-red-600 hover:text-red-700"
                >
                  {updateRdv.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  <UserX className="h-4 w-4 mr-2" />
                  Marquer no-show
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setResultRdv(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
