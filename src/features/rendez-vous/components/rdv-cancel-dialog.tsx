import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useCancelRdvWithReason } from '../hooks/use-rdv'

interface RdvCancelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rdvId: string | null
  prospectName: string | null
}

const MIN_REASON_LENGTH = 5

export function RdvCancelDialog({ open, onOpenChange, rdvId, prospectName }: RdvCancelDialogProps) {
  const [reason, setReason] = useState('')
  const cancelRdv = useCancelRdvWithReason()

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  const trimmed = reason.trim()
  const isValid = trimmed.length >= MIN_REASON_LENGTH

  async function handleConfirm() {
    if (!rdvId || !isValid) return
    try {
      await cancelRdv.mutateAsync({ rdvId, reason: trimmed })
      toast.success('RDV annulé')
      onOpenChange(false)
    } catch {
      // toast géré par le hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            Annuler le RDV
          </DialogTitle>
          {prospectName && (
            <DialogDescription>{prospectName}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason" className="text-sm">
              Raison de l'annulation <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Pourquoi le RDV est-il annulé ?"
              rows={4}
              className="text-sm"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {trimmed.length < MIN_REASON_LENGTH
                ? `Minimum ${MIN_REASON_LENGTH} caractères (${trimmed.length}/${MIN_REASON_LENGTH})`
                : `${trimmed.length} caractères`}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Retour</Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isValid || cancelRdv.isPending || !rdvId}
          >
            {cancelRdv.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Confirmer l'annulation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
