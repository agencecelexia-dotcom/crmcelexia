import { XCircle, Skull } from 'lucide-react'
import { cn } from '@/lib/utils'

type TerminalStatus = 'perdu' | 'mort'

interface KanbanTerminalStripProps {
  dragActive: boolean
  dragOverStatus: TerminalStatus | null
  onDragOver: (status: TerminalStatus) => void
  onDragLeave: () => void
  onDrop: (status: TerminalStatus) => void
  lostCount: number
  deadCount: number
}

export function KanbanTerminalStrip({
  dragActive,
  dragOverStatus,
  onDragOver,
  onDragLeave,
  onDrop,
  lostCount,
  deadCount,
}: KanbanTerminalStripProps) {
  if (!dragActive) {
    return (
      <div className="flex gap-3 mt-3">
        <div className="flex-1 rounded-lg border border-dashed p-3 flex items-center gap-2 text-sm text-muted-foreground">
          <XCircle className="h-4 w-4 text-red-500" />
          <span>Perdu ({lostCount})</span>
        </div>
        <div className="flex-1 rounded-lg border border-dashed p-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Skull className="h-4 w-4 text-gray-500" />
          <span>Mort ({deadCount})</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 mt-3">
      {/* Perdu drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver('perdu') }}
        onDragLeave={onDragLeave}
        onDrop={(e) => { e.preventDefault(); onDrop('perdu') }}
        className={cn(
          'flex-1 rounded-lg border-2 border-dashed p-4 flex items-center justify-center gap-2 transition-all',
          dragOverStatus === 'perdu'
            ? 'border-red-500 bg-red-50 text-red-700 scale-[1.02]'
            : 'border-red-300 text-red-600 hover:bg-red-50',
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
          'flex-1 rounded-lg border-2 border-dashed p-4 flex items-center justify-center gap-2 transition-all',
          dragOverStatus === 'mort'
            ? 'border-gray-500 bg-gray-50 text-gray-700 scale-[1.02]'
            : 'border-gray-300 text-gray-600 hover:bg-gray-50',
        )}
      >
        <Skull className="h-5 w-5" />
        <span className="font-semibold">Mort</span>
      </div>
    </div>
  )
}
