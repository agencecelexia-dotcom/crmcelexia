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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, PhoneCall } from 'lucide-react'
import { toast } from 'sonner'
import { useMarkRecallAttempt } from '../hooks/use-rdv'
import type { RecallResult } from '../services/rdv-service'

interface RdvRecallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rdvId: string | null
  prospectName: string | null
}

const RECALL_OPTIONS: { value: RecallResult; label: string; hint?: string }[] = [
  { value: 'positive', label: 'Réponse positive (nouveau RDV)', hint: 'Le prospect veut reprendre rendez-vous' },
  { value: 'no_answer', label: 'Pas de réponse', hint: "N'a pas décroché" },
  { value: 'refusal', label: 'Refus', hint: 'A refusé un nouveau RDV' },
  { value: 'unreachable', label: 'Numéro injoignable', hint: 'Numéro invalide ou hors service' },
]

export function RdvRecallDialog({ open, onOpenChange, rdvId, prospectName }: RdvRecallDialogProps) {
  const [result, setResult] = useState<RecallResult>('no_answer')
  const [notes, setNotes] = useState('')
  const markRecall = useMarkRecallAttempt()

  // reset state when reopened
  useEffect(() => {
    if (open) {
      setResult('no_answer')
      setNotes('')
    }
  }, [open])

  async function handleConfirm() {
    if (!rdvId) return
    try {
      await markRecall.mutateAsync({ rdvId, result })
      toast.success(
        result === 'positive'
          ? 'Marqué comme récupéré — pensez à recréer un RDV'
          : 'Tentative de rappel enregistrée',
      )
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
            <PhoneCall className="h-5 w-5 text-red-500" />
            Marquer rappelé
          </DialogTitle>
          {prospectName && (
            <DialogDescription>{prospectName}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2">
          <RadioGroup value={result} onValueChange={(v) => setResult(v as RecallResult)}>
            {RECALL_OPTIONS.map((opt) => (
              <div key={opt.value} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/40 transition-colors">
                <RadioGroupItem value={opt.value} id={`recall-${opt.value}`} className="mt-0.5" />
                <Label htmlFor={`recall-${opt.value}`} className="flex-1 cursor-pointer">
                  <span className="font-medium">{opt.label}</span>
                  {opt.hint && (
                    <span className="block text-xs text-muted-foreground mt-0.5">{opt.hint}</span>
                  )}
                </Label>
              </div>
            ))}
          </RadioGroup>

          <div className="space-y-1.5">
            <Label htmlFor="recall-notes" className="text-sm">Notes (optionnel)</Label>
            <Textarea
              id="recall-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Détails de l'appel..."
              rows={3}
              className="text-sm"
            />
          </div>

          {result === 'positive' && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
              Réponse positive : pensez ensuite à créer un nouveau RDV depuis la fiche prospect.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleConfirm} disabled={markRecall.isPending || !rdvId}>
            {markRecall.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
