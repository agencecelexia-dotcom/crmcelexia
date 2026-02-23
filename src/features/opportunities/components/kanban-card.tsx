import type { Opportunity } from '@/types'
import { formatCurrency } from '@/lib/format'
import { OPPORTUNITY_STAGE_HEX } from '@/types/enums'
import { cn } from '@/lib/utils'

interface KanbanCardProps {
  opportunity: Opportunity
  isDragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
}

export function KanbanCard({ opportunity, isDragging, onDragStart, onDragEnd, onClick }: KanbanCardProps) {
  const pending = opportunity.project_price - opportunity.amount_collected

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', opportunity.id)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        'rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing transition-all hover:shadow-md',
        isDragging && 'opacity-40 scale-95',
      )}
    >
      {/* Prospect name */}
      <p className="text-xs font-medium text-muted-foreground truncate">
        {opportunity.prospect?.company_name ?? '—'}
      </p>

      {/* Opportunity name */}
      <p className="text-sm font-semibold mt-0.5 truncate">{opportunity.name}</p>

      {/* Financial info */}
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Prix projet</span>
          <span className="font-semibold tabular-nums">{formatCurrency(opportunity.project_price)}</span>
        </div>
        {opportunity.amount_collected > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-emerald-600">Encaissé</span>
            <span className="font-medium tabular-nums text-emerald-600">{formatCurrency(opportunity.amount_collected)}</span>
          </div>
        )}
        {pending > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-orange-600">Reste</span>
            <span className="font-medium tabular-nums text-orange-600">{formatCurrency(pending)}</span>
          </div>
        )}
      </div>

      {/* Recall date for mort */}
      {opportunity.status === 'mort' && opportunity.recall_date && (
        <div className="mt-2 rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
          Rappel : {new Date(opportunity.recall_date).toLocaleDateString('fr-FR')}
        </div>
      )}

      {/* Bottom: close date + commercial */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t">
        {opportunity.expected_close_date ? (
          <span className="text-[10px] text-muted-foreground">
            {new Date(opportunity.expected_close_date).toLocaleDateString('fr-FR')}
          </span>
        ) : (
          <span />
        )}
        {opportunity.commercial && (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
            style={{ backgroundColor: OPPORTUNITY_STAGE_HEX[opportunity.status] }}
            title={opportunity.commercial.full_name}
          >
            {opportunity.commercial.full_name?.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    </div>
  )
}
