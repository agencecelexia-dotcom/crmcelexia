import { XCircle, Skull } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'

type TerminalStatus = 'perdu' | 'mort'

interface KanbanTerminalStripProps {
  dragActive: boolean
  dragOverStatus: TerminalStatus | null
  onDragOver: (status: TerminalStatus) => void
  onDragLeave: () => void
  onDrop: (status: TerminalStatus) => void
  lostCount: number
  deadCount: number
  lostValue?: number
  deadValue?: number
}

export function KanbanTerminalStrip({
  dragActive,
  dragOverStatus,
  onDragOver,
  onDragLeave,
  onDrop,
  lostCount,
  deadCount,
  lostValue = 0,
  deadValue = 0,
}: KanbanTerminalStripProps) {
  if (!dragActive) {
    return (
      <div className="flex gap-3 mt-4">
        <div className="flex-1 rounded-lg border border-red-200 bg-red-50/50 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <XCircle className="h-4 w-4" />
            <span className="font-medium">Perdu</span>
            <span className="text-xs bg-red-100 rounded-full px-2 py-0.5">{lostCount}</span>
          </div>
          {lostValue > 0 && (
            <span className="text-xs font-medium text-red-600 tabular-nums">{formatCurrency(lostValue)}</span>
          )}
        </div>
        <div className="flex-1 rounded-lg border border-gray-300 bg-gray-50/50 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Skull className="h-4 w-4" />
            <span className="font-medium">Mort</span>
            <span className="text-xs bg-gray-200 rounded-full px-2 py-0.5">{deadCount}</span>
          </div>
          {deadValue > 0 && (
            <span className="text-xs font-medium text-gray-600 tabular-nums">{formatCurrency(deadValue)}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 mt-4">
      {/* Perdu drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver('perdu') }}
        onDragLeave={onDragLeave}
        onDrop={(e) => { e.preventDefault(); onDrop('perdu') }}
        className={cn(
          'flex-1 rounded-lg border-2 border-dashed p-5 flex items-center justify-center gap-2 transition-all',
          dragOverStatus === 'perdu'
            ? 'border-red-500 bg-red-100 text-red-700 scale-[1.02]'
            : 'border-red-300 text-red-600 bg-red-50 hover:bg-red-100',
        )}
      >
        <XCircle className="h-5 w-5" />
        <span className="font-semibold">Perdu</span>
      </div>

      {/* Mort drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver('mort') }}
        onDragLeave={onDragLeave}
        onDrop={(e) => { e.preventDefault(); onDrop('mort') }}
        className={cn(
          'flex-1 rounded-lg border-2 border-dashed p-5 flex items-center justify-center gap-2 transition-all',
          dragOverStatus === 'mort'
            ? 'border-gray-500 bg-gray-200 text-gray-700 scale-[1.02]'
            : 'border-gray-400 text-gray-600 bg-gray-50 hover:bg-gray-100',
        )}
      >
        <Skull className="h-5 w-5" />
        <span className="font-semibold">Mort</span>
      </div>
    </div>
  )
}
