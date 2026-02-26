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
} from 'lucide-react'
import {
  REMINDER_CONTEXT_LABELS,
  REMINDER_CONTEXT_COLORS,
  REMINDER_CONTEXT_BORDER,
  type ReminderContext,
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
  const prospect = reminder.prospect as { id: string; company_name: string; phone?: string; status?: string } | undefined

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

        {/* Prospect */}
        {prospect && (
          <button
            onClick={() => navigate(`/prospects/${prospect.id}`)}
            className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            {prospect.company_name}
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </button>
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
  const completeReminder = useCompleteReminder()

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

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b bg-background">
        <Bell className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Rappels</h1>
        {totalActive > 0 && (
          <Badge className="bg-red-500 text-white text-xs">{totalActive}</Badge>
        )}
        {isFounder && (
          <Badge variant="outline" className="ml-auto text-xs">Équipe complète</Badge>
        )}
      </div>

      {isLoading ? (
        <div className="flex-1 p-6 space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : totalActive === 0 ? (
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
          </div>
        </div>
      )}
    </div>
  )
}
