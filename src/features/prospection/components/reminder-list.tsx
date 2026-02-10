import { useRemindersForProspect, useCompleteReminder } from '../hooks/use-reminders'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Check, Clock, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface ReminderListProps {
  prospectId: string
  onComplete?: () => void
}

export function ReminderList({ prospectId, onComplete }: ReminderListProps) {
  const { data: reminders, isLoading } = useRemindersForProspect(prospectId)
  const completeReminder = useCompleteReminder()

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    )
  }

  if (!reminders || reminders.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Aucun rappel planifié.
      </p>
    )
  }

  const now = new Date()

  async function handleComplete(id: string) {
    try {
      await completeReminder.mutateAsync(id)
      toast.success('Rappel marqué comme fait')
      onComplete?.()
    } catch {
      toast.error('Erreur')
    }
  }

  return (
    <div className="space-y-2">
      {reminders.map((reminder) => {
        const isOverdue = !reminder.is_completed && new Date(reminder.remind_at) < now
        const isToday = !reminder.is_completed &&
          new Date(reminder.remind_at).toDateString() === now.toDateString()

        return (
          <div
            key={reminder.id}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-3',
              reminder.is_completed && 'opacity-50',
              isOverdue && 'border-red-300 bg-red-50',
              isToday && !isOverdue && 'border-orange-300 bg-orange-50',
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm">
                {isOverdue && <AlertTriangle className="h-4 w-4 text-red-500" />}
                {isToday && !isOverdue && <Clock className="h-4 w-4 text-orange-500" />}
                <span className={cn(
                  'font-medium',
                  reminder.is_completed && 'line-through',
                )}>
                  {formatDate(reminder.remind_at)}
                </span>
                {isOverdue && <span className="text-xs text-red-600 font-medium">En retard</span>}
              </div>
              {reminder.note && (
                <p className="mt-1 text-sm text-muted-foreground">{reminder.note}</p>
              )}
            </div>
            {!reminder.is_completed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleComplete(reminder.id)}
                disabled={completeReminder.isPending}
              >
                <Check className="h-4 w-4" />
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
