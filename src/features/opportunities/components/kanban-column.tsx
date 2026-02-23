import type { Opportunity } from '@/types'
import type { OpportunityStatus } from '@/types/enums'
import { OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_STAGE_HEX } from '@/types/enums'
import { formatCurrency } from '@/lib/format'
import { KanbanCard } from './kanban-card'
import { cn } from '@/lib/utils'

interface KanbanColumnProps {
  status: OpportunityStatus
  opportunities: Opportunity[]
  isDragOver: boolean
  draggingId: string | null
  onDragOverColumn: () => void
  onDragLeaveColumn: () => void
  onDrop: () => void
  onCardDragStart: (id: string) => void
  onCardDragEnd: () => void
  onCardClick: (opp: Opportunity) => void
}

export function KanbanColumn({
  status,
  opportunities,
  isDragOver,
  draggingId,
  onDragOverColumn,
  onDragLeaveColumn,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onCardClick,
}: KanbanColumnProps) {
  const total = opportunities.reduce((sum, o) => sum + o.project_price, 0)
  const color = OPPORTUNITY_STAGE_HEX[status]

  return (
    <div
      data-status={status}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOverColumn()
      }}
      onDragLeave={onDragLeaveColumn}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      className={cn(
        'flex flex-col rounded-xl bg-muted/50 border min-w-[280px] flex-1 transition-colors',
        isDragOver && 'ring-2 bg-primary/5',
      )}
      style={isDragOver ? { borderColor: color } : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          <h3 className="text-sm font-semibold">{OPPORTUNITY_STATUS_LABELS[status]}</h3>
          <span className="text-xs bg-muted rounded-full px-2 py-0.5 font-medium text-muted-foreground">
            {opportunities.length}
          </span>
        </div>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          {formatCurrency(total)}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 pt-0 space-y-2 min-h-[100px]">
        {opportunities.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
            Aucune opportunité
          </div>
        )}
        {opportunities.map(opp => (
          <KanbanCard
            key={opp.id}
            opportunity={opp}
            isDragging={draggingId === opp.id}
            onDragStart={() => onCardDragStart(opp.id)}
            onDragEnd={onCardDragEnd}
            onClick={() => onCardClick(opp)}
          />
        ))}
      </div>
    </div>
  )
}
