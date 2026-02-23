import { useState, useMemo, useCallback } from 'react'
import type { Opportunity } from '@/types'
import type { OpportunityStatus } from '@/types/enums'
import { OPPORTUNITY_PIPELINE_STAGES, LOSS_REASON_LABELS, type LossReason } from '@/types/enums'
import { useOpportunitiesKanban, useUpdateOpportunityStatus } from '../hooks/use-opportunities'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { KanbanColumn } from './kanban-column'
import { KanbanTerminalStrip } from './kanban-terminal-strip'
import { OpportunityDetailDialog } from './opportunity-detail-dialog'
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
  const { profile, isFounder } = useAuth()
  const commercialId = isFounder ? undefined : profile?.id
  const { data: opportunities, isLoading } = useOpportunitiesKanban(commercialId)
  const statusMutation = useUpdateOpportunityStatus()

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<OpportunityStatus | null>(null)
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null)

  // Loss reason dialog state
  const [pendingLoss, setPendingLoss] = useState<{ oppId: string } | null>(null)
  const [lossReason, setLossReason] = useState<string>('')
  const [lossNotes, setLossNotes] = useState('')

  const grouped = useMemo(() => {
    const map: Record<string, Opportunity[]> = {}
    for (const stage of OPPORTUNITY_PIPELINE_STAGES) {
      map[stage] = []
    }
    map['gagne'] = []
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

  if (isLoading) {
    return (
      <div className="flex gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[400px] flex-1 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <>
      {/* Columns */}
      <div className="flex gap-4 overflow-x-auto pb-2">
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
            onCardClick={setSelectedOpp}
          />
        ))}
      </div>

      {/* Terminal strip */}
      <KanbanTerminalStrip
        dragActive={!!draggingId}
        dragOverStatus={
          dragOverStatus === 'gagne' || dragOverStatus === 'perdu' ? dragOverStatus : null
        }
        onDragOver={(s) => setDragOverStatus(s)}
        onDragLeave={() => setDragOverStatus(null)}
        onDrop={(s) => handleDrop(s)}
        wonCount={grouped['gagne']?.length ?? 0}
        lostCount={grouped['perdu']?.length ?? 0}
      />

      {/* Detail dialog */}
      <OpportunityDetailDialog
        opportunity={selectedOpp}
        open={!!selectedOpp}
        onOpenChange={(open) => { if (!open) setSelectedOpp(null) }}
      />

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
