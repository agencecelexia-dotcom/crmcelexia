import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Opportunity } from '@/types'
import type { OpportunityStatus, OpportunityType } from '@/types/enums'
import { OPPORTUNITY_PIPELINE_STAGES, OPPORTUNITY_PUB_STAGES, PUB_COMMISSION_RATE } from '@/types/enums'
import { formatCurrency } from '@/lib/format'
import { useOpportunitiesKanban, useUpdateOpportunityStatus, useUpdateOpportunity } from '../hooks/use-opportunities'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TerminalStatusDialog } from '@/components/shared/terminal-status-dialog'

interface KanbanBoardProps {
  opportunityType?: OpportunityType
}

export function KanbanBoard({ opportunityType }: KanbanBoardProps) {
  const navigate = useNavigate()
  const { profile, isFounder } = useAuth()
  const commercialId = isFounder ? undefined : profile?.id
  const { data: opportunities, isLoading } = useOpportunitiesKanban(commercialId, opportunityType)
  const statusMutation = useUpdateOpportunityStatus()
  const updateMutation = useUpdateOpportunity()

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

  // Loss reason dialog state — actual form state lives inside TerminalStatusDialog.
  const [pendingLoss, setPendingLoss] = useState<{ oppId: string } | null>(null)

  // Pub stats dialog state (required before moving to R2 or Close)
  const [pendingPubStats, setPendingPubStats] = useState<{ oppId: string; targetStatus: OpportunityStatus } | null>(null)
  const [pubBudget, setPubBudget] = useState('')
  const [pubEstimatedRevenue, setPubEstimatedRevenue] = useState('')

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

    // For Pub: require stats before moving to R2 or Close
    if (opportunityType === 'pub' && (targetStatus === 'en_attente_retour' || targetStatus === 'close')) {
      const opp = opportunities?.find(o => o.id === draggingId)
      if (opp && (!opp.budget_pub || !opp.estimated_monthly_revenue)) {
        setPubBudget(String(opp.budget_pub || ''))
        setPubEstimatedRevenue(String(opp.estimated_monthly_revenue || ''))
        setPendingPubStats({ oppId: draggingId, targetStatus })
        setDraggingId(null)
        setDragOverStatus(null)
        return
      }
    }

    statusMutation.mutate({ id: draggingId, status: targetStatus })
    setDraggingId(null)
    setDragOverStatus(null)
  }, [draggingId, opportunities, statusMutation, opportunityType])

  const confirmLoss = (reason: string, note?: string) => {
    if (!pendingLoss || !reason) return
    statusMutation.mutate({
      id: pendingLoss.oppId,
      status: 'perdu',
      extra: { loss_reason: reason, loss_notes: note },
    })
    setPendingLoss(null)
  }

  const confirmPubStats = async () => {
    if (!pendingPubStats) return
    const budget = parseFloat(pubBudget) || 0
    const revenue = parseFloat(pubEstimatedRevenue) || 0
    if (!budget || !revenue) return
    try {
      await updateMutation.mutateAsync({
        id: pendingPubStats.oppId,
        updates: { budget_pub: budget, estimated_monthly_revenue: revenue },
      })
      statusMutation.mutate({ id: pendingPubStats.oppId, status: pendingPubStats.targetStatus })
    } finally {
      setPendingPubStats(null)
      setPubBudget('')
      setPubEstimatedRevenue('')
    }
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
        {(opportunityType === 'pub' ? OPPORTUNITY_PUB_STAGES : OPPORTUNITY_PIPELINE_STAGES).map(stage => (
          <KanbanColumn
            key={stage}
            status={stage}
            opportunities={grouped[stage] ?? []}
            isDragOver={dragOverStatus === stage}
            draggingId={draggingId}
            opportunityType={opportunityType}
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

      {/* Pub stats dialog — required before R2 / Close */}
      <Dialog open={!!pendingPubStats} onOpenChange={(open) => { if (!open) { setPendingPubStats(null); setPubBudget(''); setPubEstimatedRevenue('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Stats Pub (LSA) — obligatoire</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Budget pub mensuel du client (EUR) *</Label>
              <Input type="number" placeholder="Ex: 1500" value={pubBudget} onChange={(e) => setPubBudget(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>CA estimé / mois pour le client (EUR) *</Label>
              <Input type="number" placeholder="Ex: 8000" value={pubEstimatedRevenue} onChange={(e) => setPubEstimatedRevenue(e.target.value)} />
            </div>
            {pubEstimatedRevenue && parseFloat(pubEstimatedRevenue) > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-amber-800">Notre commission (10%)</span>
                  <span className="font-bold text-amber-700">{formatCurrency(parseFloat(pubEstimatedRevenue) * PUB_COMMISSION_RATE)} / mois</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPendingPubStats(null); setPubBudget(''); setPubEstimatedRevenue('') }}>
              Annuler
            </Button>
            <Button onClick={confirmPubStats} disabled={!pubBudget || !pubEstimatedRevenue || parseFloat(pubBudget) <= 0 || parseFloat(pubEstimatedRevenue) <= 0}>
              Confirmer et basculer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loss reason dialog — shared component */}
      <TerminalStatusDialog
        open={!!pendingLoss}
        onOpenChange={(open) => { if (!open) setPendingLoss(null) }}
        mode="lost"
        onConfirm={confirmLoss}
        isPending={statusMutation.isPending}
      />

    </>
  )
}
