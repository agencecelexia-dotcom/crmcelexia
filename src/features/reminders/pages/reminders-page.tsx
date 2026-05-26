import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAllReminders } from '@/features/prospection/hooks/use-reminders'
import { useCompleteReminder } from '@/features/prospection/hooks/use-reminders'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import {
  Bell,
  AlertTriangle,
  Clock,
  Check,
  Phone,
  ExternalLink,
  Printer,
  Calendar,
  Hourglass,
} from 'lucide-react'
import { useNoShowRdvsToRecall, useForgottenProspects } from '../hooks/use-recall-pool'
import {
  REMINDER_CONTEXT_LABELS,
  REMINDER_CONTEXT_COLORS,
  REMINDER_CONTEXT_BORDER,
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_STATUS_COLORS,
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUS_COLORS,
  type ReminderContext,
  type OpportunityStatus,
  type ProspectStatus,
} from '@/types/enums'
import type { Reminder } from '@/types'

// ---- Helpers ----

function isOverdue(r: Reminder) {
  return !r.is_completed && new Date(r.remind_at) < new Date()
}

function isToday(r: Reminder) {
  const d = new Date(r.remind_at)
  const now = new Date()
  return !r.is_completed && d.toDateString() === now.toDateString()
}

function groupByContext(reminders: Reminder[]) {
  const groups: Record<string, Reminder[]> = {}
  for (const r of reminders) {
    const key = r.context ?? 'manuel'
    if (!groups[key]) groups[key] = []
    groups[key].push(r)
  }
  return groups
}

const CONTEXT_ORDER: ReminderContext[] = ['post_rdv', 'post_site', 'cold_call', 'post_perte', 'manuel']

// ---- Sub-component ----

interface ReminderCardProps {
  reminder: Reminder
  onComplete: (id: string, prospectId: string) => void
  isPending: boolean
}

function ReminderCard({ reminder, onComplete, isPending }: ReminderCardProps) {
  const navigate = useNavigate()
  const ctx = (reminder.context ?? 'manuel') as ReminderContext
  const overdue = isOverdue(reminder)
  const today = isToday(reminder)
  const border = REMINDER_CONTEXT_BORDER[ctx] ?? 'border-l-gray-300'
  const prospect = reminder.prospect as { id: string; company_name: string; phone?: string; status?: string; opportunities?: { id: string; status: string; deleted_at: string | null }[] } | undefined
  const activeOpp = prospect?.opportunities?.find(o => !o.deleted_at)

  return (
    <div className={cn(
      'flex items-start gap-3 rounded-lg border border-l-4 p-3 bg-background transition-opacity',
      border,
      overdue && 'bg-red-50 border-red-200',
      today && !overdue && 'bg-orange-50 border-orange-200',
      reminder.is_completed && 'opacity-40',
    )}>
      <div className="flex-1 min-w-0 space-y-1">
        {/* Header row */}
        <div className="flex items-center gap-2 flex-wrap">
          {overdue && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
          {today && !overdue && <Clock className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
          <span className={cn(
            'text-sm font-semibold',
            overdue && 'text-red-700',
            today && !overdue && 'text-orange-700',
          )}>
            {formatDate(reminder.remind_at)}
          </span>
          {overdue && <span className="text-xs text-red-600 font-medium">En retard</span>}
          {today && !overdue && <span className="text-xs text-orange-600 font-medium">Aujourd'hui</span>}
        </div>

        {/* Prospect + pipeline stage badge */}
        {prospect && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => navigate(`/prospects/${prospect.id}`)}
              className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              {prospect.company_name}
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </button>
            {/* Real pipeline stage */}
            {activeOpp ? (
              <span className={cn(
                'text-[10px] font-medium px-1.5 py-0.5 rounded',
                OPPORTUNITY_STATUS_COLORS[activeOpp.status as OpportunityStatus] ?? 'bg-gray-100 text-gray-700',
              )}>
                {OPPORTUNITY_STATUS_LABELS[activeOpp.status as OpportunityStatus] ?? activeOpp.status}
              </span>
            ) : prospect.status ? (
              <span className={cn(
                'text-[10px] font-medium px-1.5 py-0.5 rounded',
                PROSPECT_STATUS_COLORS[prospect.status as ProspectStatus] ?? 'bg-gray-100 text-gray-700',
              )}>
                {PROSPECT_STATUS_LABELS[prospect.status as ProspectStatus] ?? prospect.status}
              </span>
            ) : null}
          </div>
        )}

        {/* Note */}
        {reminder.note && (
          <p className="text-xs text-muted-foreground leading-relaxed">{reminder.note}</p>
        )}

        {/* Commercial */}
        {(reminder as unknown as { commercial?: { full_name: string } }).commercial && (
          <p className="text-[10px] text-muted-foreground/70">
            {(reminder as unknown as { commercial: { full_name: string } }).commercial.full_name}
          </p>
        )}
      </div>

      {/* Actions */}
      {!reminder.is_completed && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
          onClick={() => onComplete(reminder.id, reminder.prospect_id)}
          disabled={isPending}
          title="Marquer comme fait"
        >
          <Check className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

// ---- Sections ----

interface SectionProps {
  title: string
  icon: React.ReactNode
  reminders: Reminder[]
  colorClass: string
  onComplete: (id: string, prospectId: string) => void
  isPending: boolean
  defaultOpen?: boolean
}

function ReminderSection({ title, icon, reminders, colorClass, onComplete, isPending }: SectionProps) {
  if (reminders.length === 0) return null

  return (
    <div className="space-y-2">
      <div className={cn('flex items-center gap-2 px-1 py-2 rounded-lg', colorClass)}>
        {icon}
        <span className="text-sm font-semibold">{title}</span>
        <Badge variant="secondary" className="ml-auto text-xs h-5">{reminders.length}</Badge>
      </div>
      <div className="space-y-2 pl-1">
        {reminders.map((r) => (
          <ReminderCard key={r.id} reminder={r} onComplete={onComplete} isPending={isPending} />
        ))}
      </div>
    </div>
  )
}

// ---- Page ----

export function RemindersPage() {
  const { isFounder } = useAuth()
  const { data: reminders, isLoading } = useAllReminders()
  const { data: noShowRdvs } = useNoShowRdvsToRecall()
  const { data: forgottenProspects } = useForgottenProspects(100)
  const completeReminder = useCompleteReminder()
  const navigate = useNavigate()

  async function handleComplete(id: string, prospectId: string) {
    try {
      await completeReminder.mutateAsync({ id, prospectId })
      toast.success('Rappel marqué comme fait')
    } catch {
      toast.error('Erreur')
    }
  }

  const { overdue, today, upcoming, byContext } = useMemo(() => {
    const all = reminders ?? []
    const ov = all.filter(isOverdue).sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime())
    const td = all.filter(isToday).sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime())
    const up = all.filter((r) => !r.is_completed && !isOverdue(r) && !isToday(r))
      .sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime())
    const ctx = groupByContext(all.filter((r) => !r.is_completed))
    return { overdue: ov, today: td, upcoming: up, byContext: ctx }
  }, [reminders])

  const totalActive = overdue.length + today.length + upcoming.length
  const totalRecallPool = totalActive + (noShowRdvs?.length ?? 0) + (forgottenProspects?.length ?? 0)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b bg-background print:hidden">
        <Bell className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Rappels</h1>
        {totalActive > 0 && (
          <Badge className="bg-red-500 text-white text-xs">{totalActive}</Badge>
        )}
        {isFounder && (
          <Badge variant="outline" className="text-xs">Équipe complète</Badge>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          className="ml-auto"
          title="Imprimer la liste"
        >
          <Printer className="h-4 w-4 mr-1.5" /> Imprimer
        </Button>
      </div>

      {/* Header version impression — minimal */}
      <div className="hidden print:block px-6 py-3 border-b">
        <h1 className="text-lg font-bold">Liste des rappels à passer</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Édité le {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {isLoading ? (
        <div className="flex-1 p-6 space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : totalRecallPool === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-3">
          <Check className="h-10 w-10 text-green-500" />
          <p className="text-lg font-medium text-muted-foreground">Aucun rappel en attente</p>
          <p className="text-sm text-muted-foreground/60">Tout est à jour !</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-3xl mx-auto space-y-6">

            {/* En retard */}
            <ReminderSection
              title="En retard"
              icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
              reminders={overdue}
              colorClass="bg-red-50 text-red-800"
              onComplete={handleComplete}
              isPending={completeReminder.isPending}
            />

            {/* Aujourd'hui */}
            <ReminderSection
              title="Aujourd'hui"
              icon={<Clock className="h-4 w-4 text-orange-600" />}
              reminders={today}
              colorClass="bg-orange-50 text-orange-800"
              onComplete={handleComplete}
              isPending={completeReminder.isPending}
            />

            {(overdue.length > 0 || today.length > 0) && upcoming.length > 0 && (
              <Separator />
            )}

            {/* À venir — groupés par contexte */}
            {upcoming.length > 0 && (
              <div className="space-y-5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  À venir — par type
                </p>
                {CONTEXT_ORDER.map((ctx) => {
                  const group = (byContext[ctx] ?? []).filter((r) => !isOverdue(r) && !isToday(r))
                  if (group.length === 0) return null
                  return (
                    <ReminderSection
                      key={ctx}
                      title={REMINDER_CONTEXT_LABELS[ctx]}
                      icon={
                        <span className={cn(
                          'text-[10px] font-bold px-1.5 py-0.5 rounded border',
                          REMINDER_CONTEXT_COLORS[ctx],
                        )}>
                          {REMINDER_CONTEXT_LABELS[ctx]}
                        </span>
                      }
                      reminders={group}
                      colorClass="bg-muted/40"
                      onComplete={handleComplete}
                      isPending={completeReminder.isPending}
                    />
                  )
                })}
              </div>
            )}

            {/* RDV à rattraper — no-show / annulés avec recall_status à traiter */}
            {noShowRdvs && noShowRdvs.length > 0 && (
              <div className="space-y-2 pt-4">
                <Separator className="print:hidden" />
                <div className="flex items-center gap-2 px-1 py-2 rounded-lg bg-amber-50 text-amber-800">
                  <Calendar className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-semibold">RDV à rattraper</span>
                  <Badge variant="secondary" className="ml-auto text-xs h-5">{noShowRdvs.length}</Badge>
                </div>
                <div className="space-y-2 pl-1">
                  {noShowRdvs.map((rdv) => {
                    const p = rdv.prospect
                    if (!p) return null
                    const fullName = [p.contact_firstname, p.contact_name].filter(Boolean).join(' ')
                    return (
                      <div
                        key={rdv.id}
                        className="flex items-start gap-3 rounded-lg border border-l-4 border-l-amber-400 p-3 bg-background"
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-amber-800">
                              RDV {formatDate(rdv.scheduled_at)}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                              {rdv.recall_status === 'in_progress' ? 'Relance en cours' : 'À relancer'}
                            </span>
                            {rdv.recall_attempts > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {rdv.recall_attempts} tentative{rdv.recall_attempts > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => navigate(`/prospects/${p.id}`)}
                            className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors print:no-underline"
                          >
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            {p.company_name}
                            {fullName && <span className="text-xs text-muted-foreground">· {fullName}</span>}
                            <span className="text-xs text-muted-foreground">· {p.phone}</span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground print:hidden" />
                          </button>
                          {(rdv.no_show_reason || rdv.notes) && (
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {rdv.no_show_reason || rdv.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Prospects oubliés — next_reminder_at dépassé sans reminder actif */}
            {forgottenProspects && forgottenProspects.length > 0 && (
              <div className="space-y-2 pt-4">
                <Separator className="print:hidden" />
                <div className="flex items-center gap-2 px-1 py-2 rounded-lg bg-purple-50 text-purple-800">
                  <Hourglass className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-semibold">Opportunités à ré-ouvrir</span>
                  <Badge variant="secondary" className="ml-auto text-xs h-5">{forgottenProspects.length}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground px-1">
                  Prospects avec un rappel prévu dans le passé mais aucune action depuis. Souvent des « rappelez-moi plus tard » oubliés.
                </p>
                <div className="space-y-2 pl-1">
                  {forgottenProspects.map((p) => {
                    const fullName = [p.contact_firstname, p.contact_name].filter(Boolean).join(' ')
                    return (
                      <div
                        key={p.id}
                        className="flex items-start gap-3 rounded-lg border border-l-4 border-l-purple-400 p-3 bg-background"
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-purple-800">
                              Prévu {formatDate(p.next_reminder_at)}
                            </span>
                            {p.last_called_at && (
                              <span className="text-[10px] text-muted-foreground">
                                Dernier appel : {formatDate(p.last_called_at)}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => navigate(`/prospects/${p.id}`)}
                            className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors text-left"
                          >
                            <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">
                              {p.company_name}
                              {fullName && <span className="text-xs text-muted-foreground"> · {fullName}</span>}
                              {p.profession && <span className="text-xs text-muted-foreground"> · {p.profession}</span>}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono shrink-0">{p.phone}</span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground print:hidden" />
                          </button>
                          {p.city && (
                            <p className="text-[11px] text-muted-foreground">{p.city}</p>
                          )}
                          {p.notes && (
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{p.notes}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
