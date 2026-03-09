import { XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'

interface KanbanTerminalStripProps {
  dragActive: boolean
  dragOverStatus: 'perdu' | null
  onDragOver: (status: 'perdu') => void
  onDragLeave: () => void
  onDrop: (status: 'perdu') => void
  lostCount: number
  lostValue?: number
}

export function KanbanTerminalStrip({
  dragActive,
  dragOverStatus,
  onDragOver,
  onDragLeave,
  onDrop,
  lostCount,
  lostValue = 0,
}: KanbanTerminalStripProps) {
  return (
    <div className="flex flex-col gap-2 min-w-[110px] w-[110px] shrink-0">
      {/* Séparateur vertical */}
      <div className="flex items-center gap-1.5 mb-1">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Terminé</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Perdu */}
      {dragActive ? (
        <div
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver('perdu') }}
          onDragLeave={onDragLeave}
          onDrop={(e) => { e.preventDefault(); onDrop('perdu') }}
          className={cn(
            'flex-1 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1.5 py-4 transition-all cursor-default',
            dragOverStatus === 'perdu'
              ? 'border-red-500 bg-red-100 text-red-700 scale-[1.03]'
              : 'border-red-300 text-red-500 bg-red-50 hover:bg-red-100',
          )}
        >
          <XCircle className="h-5 w-5" />
          <span className="text-xs font-semibold">Perdu</span>
        </div>
      ) : (
        <div className="flex-1 rounded-lg border border-red-200 bg-red-50/50 p-2.5 flex flex-col gap-1 min-h-[80px]">
          <div className="flex items-center gap-1.5 text-red-700">
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs font-semibold">Perdu</span>
            <span className="ml-auto text-[10px] bg-red-100 rounded-full px-1.5 py-0.5 tabular-nums">{lostCount}</span>
          </div>
          {lostValue > 0 && (
            <p className="text-[10px] text-red-500 tabular-nums font-medium">{formatCurrency(lostValue)}</p>
          )}
        </div>
      )}
    </div>
  )
}
