import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Opportunity } from '@/types'
import type { OpportunityStatus } from '@/types/enums'
import { OPPORTUNITY_PIPELINE_STAGES, LOSS_REASON_LABELS, type LossReason } from '@/types/enums'
import { useOpportunitiesKanban, useUpdateOpportunityStatus } from '../hooks/use-opportunities'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { KanbanColumn } from './kanban-column'
import { KanbanTerminalStrip } from './kanban-terminal-strip'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function KanbanBoard() {
  const navigate = useNavigate()
  const { profile, isFounder } = useAuth()
  const commercialId = isFounder ? undefined : profile?.id
  const { data: opportunities, isLoading } = useOpportunitiesKanban(commercialId)
  const statusMutation = useUpdateOpportunityStatus()

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<OpportunityStatus | null>(null)

  // Auto-scroll while dragging
  const dragPosRef = useRef({ x: 0, y: 0 })
  const animFrameRef = useRef<number>(0)
  useEffect(() => {
    if (!draggingId) return
    const onDragOver = (e: DragEvent) => { dragPosRef.current = { x: e.clientX, y: e.clientY } }
    const scroll = () => {
      const { y } = dragPosRef.current
      const threshold = 80
      const speed = 12
      if (y < threshold) window.scrollBy(0, -speed)
      else if (y > window.innerHeight - threshold) window.scrollBy(0, speed)
      animFrameRef.current = requestAnimationFrame(scroll)
    }
    document.addEventListener('dragover', onDragOver)
    animFrameRef.current = requestAnimationFrame(scroll)
    return () => {
      document.removeEventListener('dragover', onDragOver)
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [draggingId])

  // Loss reason dialog state
  const [pendingLoss, setPendingLoss] = useState<{ oppId: string } | null>(null)
  const [lossReason, setLossReason] = useState<string>('')
  const [lossNotes, setLossNotes] = useState('')

  const grouped = useMemo(() => {
    const map: Record<string, Opportunity[]> = {}
    for (const stage of OPPORTUNITY_PIPELINE_STAGES) {
      map[stage] = []
    }
    map['perdu'] = []
    for (const opp of opportunities ?? []) {
      if (map[opp.status]) map[opp.status].push(opp)
    }
    return map
  }, [opportunities])

  const handleDrop = useCallback((targetStatus: OpportunityStatus) => {
    if (!draggingId) return
    const sourceOpp = opportunities?.find(o => o.id === draggingId)
    if (!sourceOpp || sourceOpp.status === targetStatus) {
      setDraggingId(null)
      setDragOverStatus(null)
      return
    }

    if (targetStatus === 'perdu') {
      setPendingLoss({ oppId: draggingId })
      setDraggingId(null)
      setDragOverStatus(null)
      return
    }

    statusMutation.mutate({ id: draggingId, status: targetStatus })
    setDraggingId(null)
    setDragOverStatus(null)
  }, [draggingId, opportunities, statusMutation])

  const confirmLoss = () => {
    if (!pendingLoss || !lossReason) return
    statusMutation.mutate({
      id: pendingLoss.oppId,
      status: 'perdu',
      extra: { loss_reason: lossReason, loss_notes: lossNotes || undefined },
    })
    setPendingLoss(null)
    setLossReason('')
    setLossNotes('')
  }

  const handleCardClick = useCallback((opp: Opportunity) => {
    if (opp.prospect_id) {
      navigate(`/prospects/${opp.prospect_id}`)
    }
  }, [navigate])

  // Terminal values
  const lostValue = (grouped['perdu'] ?? []).reduce((s, o) => s + o.project_price, 0)

  if (isLoading) {
    return (
      <div className="flex gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[400px] flex-1 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <>
      {/* Columns + terminal strip on the right */}
      <div className="flex gap-3 overflow-x-auto pb-2 items-start">
        {OPPORTUNITY_PIPELINE_STAGES.map(stage => (
          <KanbanColumn
            key={stage}
            status={stage}
            opportunities={grouped[stage] ?? []}
            isDragOver={dragOverStatus === stage}
            draggingId={draggingId}
            onDragOverColumn={() => setDragOverStatus(stage)}
            onDragLeaveColumn={() => setDragOverStatus(prev => prev === stage ? null : prev)}
            onDrop={() => handleDrop(stage)}
            onCardDragStart={(id) => setDraggingId(id)}
            onCardDragEnd={() => { setDraggingId(null); setDragOverStatus(null) }}
            onCardClick={handleCardClick}
          />
        ))}

        {/* Terminal: Perdu — colonne à droite */}
        <KanbanTerminalStrip
          dragActive={!!draggingId}
          dragOverStatus={dragOverStatus === 'perdu' ? 'perdu' : null}
          onDragOver={(s) => setDragOverStatus(s)}
          onDragLeave={() => setDragOverStatus(null)}
          onDrop={(s) => handleDrop(s)}
          lostCount={grouped['perdu']?.length ?? 0}
          lostValue={lostValue}
        />
      </div>

      {/* Loss reason dialog */}
      <Dialog open={!!pendingLoss} onOpenChange={(open) => { if (!open) { setPendingLoss(null); setLossReason(''); setLossNotes('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Raison de la perte</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Raison *</Label>
              <Select value={lossReason} onValueChange={setLossReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une raison..." />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(LOSS_REASON_LABELS) as [LossReason, string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={lossNotes}
                onChange={(e) => setLossNotes(e.target.value)}
                placeholder="Détails supplémentaires..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPendingLoss(null); setLossReason(''); setLossNotes('') }}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={confirmLoss} disabled={!lossReason}>
              Confirmer la perte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  )
}
