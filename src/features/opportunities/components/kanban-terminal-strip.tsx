import { Trophy, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KanbanTerminalStripProps {
  dragActive: boolean
  dragOverStatus: 'gagne' | 'perdu' | null
  onDragOver: (status: 'gagne' | 'perdu') => void
  onDragLeave: () => void
  onDrop: (status: 'gagne' | 'perdu') => void
  wonCount: number
  lostCount: number
}

export function KanbanTerminalStrip({
  dragActive,
  dragOverStatus,
  onDragOver,
  onDragLeave,
  onDrop,
  wonCount,
  lostCount,
}: KanbanTerminalStripProps) {
  if (!dragActive) {
    return (
      <div className="flex gap-3 mt-3">
        <div className="flex-1 rounded-lg border border-dashed p-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Trophy className="h-4 w-4 text-emerald-500" />
          <span>Gagné ({wonCount})</span>
        </div>
        <div className="flex-1 rounded-lg border border-dashed p-3 flex items-center gap-2 text-sm text-muted-foreground">
          <XCircle className="h-4 w-4 text-red-500" />
          <span>Perdu ({lostCount})</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 mt-3">
      {/* Gagné drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver('gagne') }}
        onDragLeave={onDragLeave}
        onDrop={(e) => { e.preventDefault(); onDrop('gagne') }}
        className={cn(
          'flex-1 rounded-lg border-2 border-dashed p-4 flex items-center justify-center gap-2 transition-all',
          dragOverStatus === 'gagne'
            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 scale-[1.02]'
            : 'border-emerald-300 text-emerald-600 hover:bg-emerald-50',
        )}
      >
        <Trophy className="h-5 w-5" />
        <span className="font-semibold">Gagné</span>
      </div>

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
    </div>
  )
}
