import { useState, useEffect } from 'react'
import type { Opportunity } from '@/types'
import {
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_STATUS_COLORS,
  LOSS_REASON_LABELS,
  type OpportunityStatus,
  type LossReason,
} from '@/types/enums'
import { useUpdateOpportunity, useUpdateOpportunityStatus } from '../hooks/use-opportunities'
import { formatCurrency, formatDateShort } from '@/lib/format'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/shared/status-badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Pencil, Save, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface OpportunityDetailDialogProps {
  opportunity: Opportunity | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OpportunityDetailDialog({ opportunity, open, onOpenChange }: OpportunityDetailDialogProps) {
  const navigate = useNavigate()
  const updateMutation = useUpdateOpportunity()
  const statusMutation = useUpdateOpportunityStatus()

  const [editing, setEditing] = useState(false)
  const [editPrice, setEditPrice] = useState('')
  const [editCollected, setEditCollected] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editCloseDate, setEditCloseDate] = useState('')

  useEffect(() => {
    if (opportunity && open) {
      setEditing(false)
    }
  }, [opportunity, open])

  if (!opportunity) return null

  const pending = opportunity.project_price - opportunity.amount_collected

  function startEditing() {
    setEditPrice(String(opportunity!.project_price))
    setEditCollected(String(opportunity!.amount_collected))
    setEditNotes(opportunity!.notes ?? '')
    setEditCloseDate(opportunity!.expected_close_date?.split('T')[0] ?? '')
    setEditing(true)
  }

  async function saveEdits() {
    try {
      await updateMutation.mutateAsync({
        id: opportunity!.id,
        updates: {
          project_price: parseFloat(editPrice) || 0,
          amount_collected: parseFloat(editCollected) || 0,
          notes: editNotes.trim() || null,
          expected_close_date: editCloseDate || null,
        },
      })
      setEditing(false)
    } catch {
      // toast handled by hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg">{opportunity.name}</DialogTitle>
            {!editing && (
              <Button variant="ghost" size="sm" onClick={startEditing}>
                <Pencil className="h-4 w-4 mr-1" /> Modifier
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Prospect info */}
          {opportunity.prospect && (
            <div className="rounded-lg bg-muted p-3">
              <button
                type="button"
                className="font-medium text-sm hover:underline text-left"
                onClick={() => { onOpenChange(false); navigate(`/prospects/${opportunity.prospect_id}`) }}
              >
                {opportunity.prospect.company_name}
              </button>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">Statut</Label>
            {editing ? (
              <Select
                value={opportunity.status}
                onValueChange={(v) => {
                  statusMutation.mutate({ id: opportunity.id, status: v as OpportunityStatus })
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(OPPORTUNITY_STATUS_LABELS) as [OpportunityStatus, string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <StatusBadge
                label={OPPORTUNITY_STATUS_LABELS[opportunity.status]}
                colorClass={OPPORTUNITY_STATUS_COLORS[opportunity.status]}
              />
            )}
          </div>

          {/* Financial */}
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Prix du projet (EUR)</Label>
                <Input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Montant encaissé (EUR)</Label>
                <Input type="number" value={editCollected} onChange={(e) => setEditCollected(e.target.value)} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Reste à encaisser</span>
                <span className="font-semibold text-orange-600">
                  {formatCurrency((parseFloat(editPrice) || 0) - (parseFloat(editCollected) || 0))}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Prix du projet</span>
                <span className="font-semibold">{formatCurrency(opportunity.project_price)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-emerald-600">Encaissé</span>
                <span className="font-semibold text-emerald-600">{formatCurrency(opportunity.amount_collected)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-orange-600">Reste</span>
                <span className="font-semibold text-orange-600">{formatCurrency(pending)}</span>
              </div>
            </div>
          )}

          {/* Close date */}
          {editing ? (
            <div className="space-y-1">
              <Label>Date closing prévue</Label>
              <Input type="date" value={editCloseDate} onChange={(e) => setEditCloseDate(e.target.value)} />
            </div>
          ) : opportunity.expected_close_date ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Closing prévu</span>
              <span>{formatDateShort(opportunity.expected_close_date)}</span>
            </div>
          ) : null}

          {/* Loss reason (if perdu) */}
          {opportunity.status === 'perdu' && opportunity.loss_reason && (
            <div className="rounded-lg bg-red-50 p-3 space-y-1">
              <p className="text-sm font-medium text-red-800">
                Raison : {LOSS_REASON_LABELS[opportunity.loss_reason as LossReason] ?? opportunity.loss_reason}
              </p>
              {opportunity.loss_notes && (
                <p className="text-sm text-red-700">{opportunity.loss_notes}</p>
              )}
            </div>
          )}

          {/* Notes */}
          {editing ? (
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} />
            </div>
          ) : opportunity.notes ? (
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Notes</Label>
              <p className="text-sm whitespace-pre-wrap">{opportunity.notes}</p>
            </div>
          ) : null}

          {/* Details */}
          <div className="text-xs text-muted-foreground space-y-0.5 pt-2 border-t">
            {opportunity.commercial && (
              <p>Commercial : {opportunity.commercial.full_name}</p>
            )}
            <p>Créée le {formatDateShort(opportunity.created_at)}</p>
          </div>
        </div>

        {/* Edit actions */}
        {editing && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              <X className="h-4 w-4 mr-1" /> Annuler
            </Button>
            <Button size="sm" onClick={saveEdits} disabled={updateMutation.isPending}>
              <Save className="h-4 w-4 mr-1" /> Enregistrer
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
