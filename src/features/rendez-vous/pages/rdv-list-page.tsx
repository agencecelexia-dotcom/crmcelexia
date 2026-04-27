import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/use-auth'
import {
  useRdvSection,
  useRdvKpis,
  useUpdateRdv,
} from '../hooks/use-rdv'
import { useRescheduleRdv } from '@/features/calendar/hooks/use-calendar'
import type { RendezVous } from '@/types'
import {
  RDV_STATUS_LABELS,
  RDV_STATUS_COLORS,
  RDV_TYPE_LABELS,
} from '@/types/enums'
import { StatusBadge } from '@/components/shared/status-badge'
import { StatCard } from '@/components/shared/stat-card'
import { RdvSectionCard } from '../components/rdv-section-card'
import { RdvCancelDialog } from '../components/rdv-cancel-dialog'
import { RdvRecallDialog } from '../components/rdv-recall-dialog'
import { formatPhone } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  CalendarDays,
  CheckCircle2,
  UserX,
  XCircle,
  Phone,
  Video,
  MapPin,
  ExternalLink,
  PhoneCall,
  Loader2,
  Search,
  RefreshCcw,
  Activity,
  TrendingUp,
  CalendarCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow, parseISO, format, differenceInMilliseconds } from 'date-fns'
import { fr } from 'date-fns/locale'

const TYPE_ICONS = {
  telephone: Phone,
  visio: Video,
  presentiel: MapPin,
} as const

const RECALL_STATUS_LABELS: Record<NonNullable<RendezVous['recall_status']>, string> = {
  not_needed: 'Non requis',
  to_do: 'À faire',
  in_progress: 'En cours',
  recovered: 'Récupéré',
  abandoned: 'Abandonné',
}

const RECALL_STATUS_COLORS: Record<NonNullable<RendezVous['recall_status']>, string> = {
  not_needed: 'bg-gray-100 text-gray-700',
  to_do: 'bg-orange-100 text-orange-800',
  in_progress: 'bg-amber-100 text-amber-800',
  recovered: 'bg-emerald-100 text-emerald-800',
  abandoned: 'bg-red-100 text-red-800',
}

type DoneFilter = 'all' | 'shown' | 'no_show' | 'cancelled'

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function ProspectCell({ rdv, onClick }: { rdv: RendezVous; onClick: () => void }) {
  const fullName = [rdv.prospect?.contact_firstname, rdv.prospect?.contact_name]
    .filter(Boolean)
    .join(' ')
  return (
    <div className="min-w-0">
      <button
        onClick={onClick}
        className="font-medium text-left hover:text-primary hover:underline truncate block"
      >
        {rdv.prospect?.company_name ?? 'Prospect'}
      </button>
      {fullName && (
        <p className="text-xs text-muted-foreground truncate">{fullName}</p>
      )}
      {rdv.prospect?.profession && (
        <p className="text-xs text-muted-foreground truncate">{rdv.prospect.profession}</p>
      )}
    </div>
  )
}

function TypeBadge({ rdv }: { rdv: RendezVous }) {
  const Icon = TYPE_ICONS[rdv.type]
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {RDV_TYPE_LABELS[rdv.type]}
    </span>
  )
}

function RdvIndexBadge({ rdv }: { rdv: RendezVous }) {
  if (!rdv.rdv_index) return null
  return (
    <Badge variant="outline" className="text-xs font-medium">
      R{rdv.rdv_index}
    </Badge>
  )
}

function RelativeDate({ iso, highlightSoon = false }: { iso: string; highlightSoon?: boolean }) {
  const date = parseISO(iso)
  const isSoon =
    highlightSoon && differenceInMilliseconds(date, new Date()) > 0 &&
    differenceInMilliseconds(date, new Date()) < 2 * 60 * 60 * 1000
  return (
    <div className={isSoon ? 'text-red-600 font-semibold' : ''}>
      <p className="text-sm">
        {formatDistanceToNow(date, { addSuffix: true, locale: fr })}
      </p>
      <p className="text-xs text-muted-foreground">
        {format(date, 'd MMM HH:mm', { locale: fr })}
      </p>
    </div>
  )
}

export function RdvListPage() {
  const navigate = useNavigate()
  const { isFounder } = useAuth()

  const upcomingQ = useRdvSection('upcoming')
  const pendingQ = useRdvSection('pending')
  const recallQ = useRdvSection('recall')
  const doneQ = useRdvSection('done')
  const kpisQ = useRdvKpis()

  const updateRdv = useUpdateRdv()
  const rescheduleRdv = useRescheduleRdv()

  // Dialog states
  const [cancelDialog, setCancelDialog] = useState<{ rdvId: string; name: string } | null>(null)
  const [recallDialog, setRecallDialog] = useState<{ rdvId: string; name: string } | null>(null)
  const [outcomeRdv, setOutcomeRdv] = useState<RendezVous | null>(null)
  const [outcomeResult, setOutcomeResult] = useState('')
  const [rescheduleRdvId, setRescheduleRdvId] = useState<string | null>(null)
  const [rescheduleAt, setRescheduleAt] = useState('')

  // Done section filters
  const [doneFilter, setDoneFilter] = useState<DoneFilter>('all')
  const [doneSearch, setDoneSearch] = useState('')

  const upcoming = upcomingQ.data ?? []
  const pending = pendingQ.data ?? []
  const recall = recallQ.data ?? []
  const done = doneQ.data ?? []
  const kpis = kpisQ.data

  const filteredDone = useMemo(() => {
    let rows = done
    switch (doneFilter) {
      case 'shown':
        rows = rows.filter((r) => ['show', 'fait', 'close'].includes(r.status))
        break
      case 'no_show':
        rows = rows.filter((r) => r.status === 'no_show')
        break
      case 'cancelled':
        rows = rows.filter((r) => r.status === 'annule')
        break
    }
    if (doneSearch.trim()) {
      const q = doneSearch.trim().toLowerCase()
      rows = rows.filter((r) => {
        const name = [
          r.prospect?.company_name,
          r.prospect?.contact_firstname,
          r.prospect?.contact_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return name.includes(q)
      })
    }
    return rows
  }, [done, doneFilter, doneSearch])

  async function quickStatus(rdvId: string, status: RendezVous['status']) {
    try {
      await updateRdv.mutateAsync({ id: rdvId, updates: { status } })
      toast.success(`Statut → ${RDV_STATUS_LABELS[status]}`)
    } catch {
      // toast géré par le hook
    }
  }

  async function handleConfirmOutcome() {
    if (!outcomeRdv) return
    try {
      await updateRdv.mutateAsync({
        id: outcomeRdv.id,
        updates: {
          status: 'show',
          result: outcomeResult.trim() || 'Show',
        },
      })
      toast.success('RDV marqué comme présenté (show)')
      setOutcomeRdv(null)
      setOutcomeResult('')
    } catch {
      // toast géré par le hook
    }
  }

  async function handleConfirmReschedule() {
    if (!rescheduleRdvId || !rescheduleAt) return
    try {
      const iso = new Date(rescheduleAt).toISOString()
      await rescheduleRdv.mutateAsync({ rdvId: rescheduleRdvId, newScheduledAt: iso })
      setRescheduleRdvId(null)
      setRescheduleAt('')
    } catch {
      // toast géré par le hook
    }
  }

  function isLoading(): boolean {
    return upcomingQ.isLoading || pendingQ.isLoading || recallQ.isLoading || doneQ.isLoading
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Rendez-vous</h1>
          <p className="text-sm text-muted-foreground">
            Pilotage des RDV : à venir, à statuer, rappels post no-show, traités
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/calendar')}>
          <CalendarDays className="mr-2 h-4 w-4" />
          Voir le calendrier
        </Button>
      </div>

      {/* KPI band */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpisQ.isLoading || !kpis ? (
          <>
            <Skeleton className="h-[110px] w-full rounded-lg" />
            <Skeleton className="h-[110px] w-full rounded-lg" />
            <Skeleton className="h-[110px] w-full rounded-lg" />
            <Skeleton className="h-[110px] w-full rounded-lg" />
          </>
        ) : (
          <>
            <StatCard
              title="Taux de présence (30j)"
              value={formatPercent(kpis.presenceRate30d)}
              subtitle="Show vs no-show sur RDV traités"
              icon={Activity}
            />
            <StatCard
              title="Taux R1 → R2"
              value={formatPercent(kpis.r1ToR2Rate)}
              subtitle="rdv_index renseigné requis"
              icon={TrendingUp}
            />
            <StatCard
              title="Récupération no-shows"
              value={formatPercent(kpis.recallRecoveryRate)}
              subtitle="recovered / (recovered + abandoned)"
              icon={PhoneCall}
            />
            <StatCard
              title="RDV cette semaine"
              value={kpis.weekUpcoming}
              subtitle="prévus + confirmés (lun-dim)"
              icon={CalendarCheck}
            />
          </>
        )}
      </div>

      {isLoading() && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      )}

      {/* Section 1 : RDV à venir */}
      <RdvSectionCard title="RDV à venir" count={upcoming.length}>
        {upcoming.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Aucun RDV à venir.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quand</TableHead>
                  <TableHead>Prospect</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>R1/R2</TableHead>
                  {isFounder && <TableHead>Commercial</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcoming.map((rdv) => (
                  <TableRow key={rdv.id}>
                    <TableCell>
                      <RelativeDate iso={rdv.scheduled_at} highlightSoon />
                    </TableCell>
                    <TableCell>
                      <ProspectCell rdv={rdv} onClick={() => navigate(`/prospects/${rdv.prospect_id}`)} />
                    </TableCell>
                    <TableCell><TypeBadge rdv={rdv} /></TableCell>
                    <TableCell><RdvIndexBadge rdv={rdv} /></TableCell>
                    {isFounder && (
                      <TableCell className="text-xs text-muted-foreground">
                        {rdv.commercial?.full_name ?? '—'}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {rdv.meeting_url && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(rdv.meeting_url!, '_blank', 'noopener,noreferrer')}
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            Rejoindre
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setRescheduleRdvId(rdv.id)
                            setRescheduleAt(format(parseISO(rdv.scheduled_at), "yyyy-MM-dd'T'HH:mm"))
                          }}
                        >
                          <RefreshCcw className="h-3.5 w-3.5 mr-1" />
                          Replanifier
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                          onClick={() =>
                            setCancelDialog({
                              rdvId: rdv.id,
                              name: rdv.prospect?.company_name ?? 'Prospect',
                            })
                          }
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Annuler
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </RdvSectionCard>

      {/* Section 2 : RDV à statuer */}
      <RdvSectionCard title="RDV à statuer" count={pending.length} accent="warning">
        {pending.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Tous les RDV passés ont été statués.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quand</TableHead>
                  <TableHead>Prospect</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>R1/R2</TableHead>
                  {isFounder && <TableHead>Commercial</TableHead>}
                  <TableHead className="text-right">Statuer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((rdv) => (
                  <TableRow key={rdv.id} className="bg-orange-50/40">
                    <TableCell>
                      <RelativeDate iso={rdv.scheduled_at} />
                    </TableCell>
                    <TableCell>
                      <ProspectCell rdv={rdv} onClick={() => navigate(`/prospects/${rdv.prospect_id}`)} />
                    </TableCell>
                    <TableCell><TypeBadge rdv={rdv} /></TableCell>
                    <TableCell><RdvIndexBadge rdv={rdv} /></TableCell>
                    {isFounder && (
                      <TableCell className="text-xs text-muted-foreground">
                        {rdv.commercial?.full_name ?? '—'}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-700 border-green-200 hover:bg-green-50"
                          disabled={updateRdv.isPending}
                          onClick={() => {
                            setOutcomeRdv(rdv)
                            setOutcomeResult('')
                          }}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Présenté
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-700 border-red-200 hover:bg-red-50"
                          disabled={updateRdv.isPending}
                          onClick={() => quickStatus(rdv.id, 'no_show')}
                        >
                          <UserX className="h-3.5 w-3.5 mr-1" />
                          No-show
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setCancelDialog({
                              rdvId: rdv.id,
                              name: rdv.prospect?.company_name ?? 'Prospect',
                            })
                          }
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Annulé en amont
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </RdvSectionCard>

      {/* Section 3 : À rappeler */}
      <RdvSectionCard title="À rappeler" count={recall.length} accent="destructive">
        {recall.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Aucun rappel à traiter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No-show</TableHead>
                  <TableHead>Prospect</TableHead>
                  <TableHead>Téléphone</TableHead>
                  {isFounder && <TableHead>Commercial</TableHead>}
                  <TableHead>Tentatives</TableHead>
                  <TableHead>Statut rappel</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recall.map((rdv) => (
                  <TableRow key={rdv.id}>
                    <TableCell>
                      <RelativeDate iso={rdv.scheduled_at} />
                    </TableCell>
                    <TableCell>
                      <ProspectCell rdv={rdv} onClick={() => navigate(`/prospects/${rdv.prospect_id}`)} />
                    </TableCell>
                    <TableCell>
                      {rdv.prospect?.phone ? (
                        <a
                          href={`tel:${rdv.prospect.phone}`}
                          className="font-mono text-sm text-primary hover:underline"
                        >
                          {formatPhone(rdv.prospect.phone)}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {isFounder && (
                      <TableCell className="text-xs text-muted-foreground">
                        {rdv.commercial?.full_name ?? '—'}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {rdv.recall_attempts}/3
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {rdv.recall_status && (
                        <StatusBadge
                          label={RECALL_STATUS_LABELS[rdv.recall_status]}
                          colorClass={RECALL_STATUS_COLORS[rdv.recall_status]}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setRecallDialog({
                              rdvId: rdv.id,
                              name: rdv.prospect?.company_name ?? 'Prospect',
                            })
                          }
                        >
                          <PhoneCall className="h-3.5 w-3.5 mr-1" />
                          Marquer rappelé
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setRescheduleRdvId(rdv.id)
                            setRescheduleAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"))
                          }}
                        >
                          <RefreshCcw className="h-3.5 w-3.5 mr-1" />
                          Replanifier
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </RdvSectionCard>

      {/* Section 4 : RDV traités (30j) */}
      <RdvSectionCard title="RDV traités (30j)" count={filteredDone.length}>
        <div className="p-3 border-b flex items-center gap-2 flex-wrap bg-muted/20">
          <div className="flex rounded-lg border bg-background p-0.5 text-xs">
            {([
              { value: 'all', label: 'Tous' },
              { value: 'shown', label: 'Présentés' },
              { value: 'no_show', label: 'No-shows' },
              { value: 'cancelled', label: 'Annulés' },
            ] satisfies { value: DoneFilter; label: string }[]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDoneFilter(opt.value)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  doneFilter === opt.value
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={doneSearch}
              onChange={(e) => setDoneSearch(e.target.value)}
              placeholder="Rechercher par nom..."
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        {filteredDone.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Aucun RDV ne correspond aux filtres.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Prospect</TableHead>
                  <TableHead>R1/R2</TableHead>
                  <TableHead>Statut</TableHead>
                  {isFounder && <TableHead>Commercial</TableHead>}
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDone.map((rdv) => (
                  <TableRow key={rdv.id}>
                    <TableCell>
                      <RelativeDate iso={rdv.scheduled_at} />
                    </TableCell>
                    <TableCell>
                      <ProspectCell rdv={rdv} onClick={() => navigate(`/prospects/${rdv.prospect_id}`)} />
                    </TableCell>
                    <TableCell><RdvIndexBadge rdv={rdv} /></TableCell>
                    <TableCell>
                      <StatusBadge
                        label={RDV_STATUS_LABELS[rdv.status]}
                        colorClass={RDV_STATUS_COLORS[rdv.status]}
                      />
                    </TableCell>
                    {isFounder && (
                      <TableCell className="text-xs text-muted-foreground">
                        {rdv.commercial?.full_name ?? '—'}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/prospects/${rdv.prospect_id}`)}
                      >
                        Fiche prospect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </RdvSectionCard>

      {/* Mounted dialogs */}
      <RdvCancelDialog
        open={!!cancelDialog}
        onOpenChange={(open) => { if (!open) setCancelDialog(null) }}
        rdvId={cancelDialog?.rdvId ?? null}
        prospectName={cancelDialog?.name ?? null}
      />
      <RdvRecallDialog
        open={!!recallDialog}
        onOpenChange={(open) => { if (!open) setRecallDialog(null) }}
        rdvId={recallDialog?.rdvId ?? null}
        prospectName={recallDialog?.name ?? null}
      />

      {/* Outcome (Présenté) Dialog */}
      <Dialog open={!!outcomeRdv} onOpenChange={(open) => { if (!open) setOutcomeRdv(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marquer comme présenté</DialogTitle>
          </DialogHeader>
          {outcomeRdv && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg bg-muted p-3">
                <p className="font-medium">{outcomeRdv.prospect?.company_name}</p>
                <p className="text-sm text-muted-foreground">
                  {format(parseISO(outcomeRdv.scheduled_at), "EEEE d MMMM 'à' HH:mm", { locale: fr })}
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Compte-rendu (optionnel)</label>
                <Input
                  value={outcomeResult}
                  onChange={(e) => setOutcomeResult(e.target.value)}
                  placeholder="Prochaines étapes, points clés..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOutcomeRdv(null)}>Annuler</Button>
            <Button onClick={handleConfirmOutcome} disabled={updateRdv.isPending}>
              {updateRdv.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={!!rescheduleRdvId} onOpenChange={(open) => { if (!open) { setRescheduleRdvId(null); setRescheduleAt('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Replanifier le RDV</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nouvelle date / heure</label>
              <Input
                type="datetime-local"
                value={rescheduleAt}
                onChange={(e) => setRescheduleAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                L'ancien RDV sera marqué no-show, un nouveau RDV est créé.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRescheduleRdvId(null); setRescheduleAt('') }}>
              Annuler
            </Button>
            <Button
              onClick={handleConfirmReschedule}
              disabled={!rescheduleAt || rescheduleRdv.isPending}
            >
              {rescheduleRdv.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
