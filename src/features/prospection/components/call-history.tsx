import { useCallsForProspect } from '../hooks/use-calls'
import { CALL_RESULT_LABELS, PROSPECT_STATUS_LABELS } from '@/types/enums'
import { formatDate } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Phone, ArrowRight } from 'lucide-react'

interface CallHistoryProps {
  prospectId: string
}

export function CallHistory({ prospectId }: CallHistoryProps) {
  const { data: calls, isLoading } = useCallsForProspect(prospectId)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    )
  }

  if (!calls || calls.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Aucun appel enregistré.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {calls.map((call) => (
        <div
          key={call.id}
          className="flex gap-3 rounded-lg border p-3"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
            <Phone className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">
                {CALL_RESULT_LABELS[call.result]}
              </span>
              {call.previous_status !== call.new_status && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {PROSPECT_STATUS_LABELS[call.previous_status]}
                  <ArrowRight className="h-3 w-3" />
                  {PROSPECT_STATUS_LABELS[call.new_status]}
                </span>
              )}
            </div>
            {call.note && (
              <p className="mt-1 text-sm text-muted-foreground">{call.note}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(call.called_at)}
              {call.commercial && ` — ${call.commercial.full_name}`}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
