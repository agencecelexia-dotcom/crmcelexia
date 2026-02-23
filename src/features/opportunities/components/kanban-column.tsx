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
  const totalPrice = opportunities.reduce((sum, o) => sum + o.project_price, 0)
  const totalCollected = opportunities.reduce((sum, o) => sum + o.amount_collected, 0)
  const totalPending = totalPrice - totalCollected
  const color = OPPORTUNITY_STAGE_HEX[status]
  const isCloseColumn = status === 'close'

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
        'flex flex-col rounded-xl bg-muted/50 border min-w-[240px] flex-1 transition-colors',
        isDragOver && 'ring-2 bg-primary/5',
      )}
      style={isDragOver ? { borderColor: color } : undefined}
    >
      {/* Header */}
      <div className="p-3 pb-2 space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <h3 className="text-sm font-semibold">{OPPORTUNITY_STATUS_LABELS[status]}</h3>
            <span className="text-xs bg-muted rounded-full px-2 py-0.5 font-medium text-muted-foreground">
              {opportunities.length}
            </span>
          </div>
        </div>
        {/* Cumul financier */}
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold tabular-nums" style={{ color }}>
            {formatCurrency(totalPrice)}
          </span>
          {isCloseColumn && totalPrice > 0 && (
            <span className="text-muted-foreground">
              <span className="text-emerald-600">{formatCurrency(totalCollected)}</span>
              {' / '}
              <span className="text-orange-600">{formatCurrency(totalPending)} en attente</span>
            </span>
          )}
        </div>
        {/* Progress bar pour Close */}
        {isCloseColumn && totalPrice > 0 && (
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, (totalCollected / totalPrice) * 100)}%` }}
            />
          </div>
        )}
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
