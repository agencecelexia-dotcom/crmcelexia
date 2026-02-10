import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useLogCall } from '../hooks/use-calls'
import type { Prospect } from '@/types'
import type { CallResult, ProspectStatus } from '@/types/enums'
import {
  CALL_RESULT_LABELS,
  CALL_RESULT_TO_STATUS,
  CALL_RESULTS_REQUIRING_NOTE,
  PROSPECT_STATUS_LABELS,
} from '@/types/enums'
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
import { formatPhone } from '@/lib/format'
import { Phone, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface CallLoggerProps {
  prospect: Prospect
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (callId: string) => void
}

export function CallLogger({ prospect, open, onOpenChange, onSuccess }: CallLoggerProps) {
  const { profile } = useAuth()
  const logCall = useLogCall()

  const [result, setResult] = useState<CallResult | ''>('')
  const [note, setNote] = useState('')

  const suggestedStatus = result ? CALL_RESULT_TO_STATUS[result as CallResult] : null
  const noteRequired = result ? CALL_RESULTS_REQUIRING_NOTE.includes(result as CallResult) : false

  function reset() {
    setResult('')
    setNote('')
  }

  async function handleSubmit() {
    if (!result) {
      toast.error('Le résultat de l\'appel est obligatoire')
      return
    }
    if (noteRequired && !note.trim()) {
      toast.error('Une note est obligatoire pour ce résultat')
      return
    }
    if (!profile) return

    try {
      const callId = await logCall.mutateAsync({
        prospect_id: prospect.id,
        commercial_id: profile.id,
        result: result as CallResult,
        new_status: suggestedStatus as ProspectStatus,
        note: note.trim() || null,
      })
      toast.success('Appel enregistré')
      reset()
      onOpenChange(false)
      onSuccess?.(callId)
    } catch {
      toast.error('Erreur lors de l\'enregistrement')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Logger un appel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Prospect info */}
          <div className="rounded-lg bg-muted p-3">
            <p className="font-medium">{prospect.company_name}</p>
            <p className="text-lg font-mono font-bold text-primary">
              {formatPhone(prospect.phone)}
            </p>
            {prospect.contact_name && (
              <p className="text-sm text-muted-foreground">
                {prospect.contact_firstname} {prospect.contact_name}
              </p>
            )}
          </div>

          {/* Result (required) */}
          <div className="space-y-2">
            <Label>Résultat de l'appel *</Label>
            <Select value={result} onValueChange={(v) => setResult(v as CallResult)}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner le résultat..." />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(CALL_RESULT_LABELS) as [CallResult, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Suggested new status */}
          {suggestedStatus && (
            <div className="rounded-lg border p-3 text-sm">
              <p className="text-muted-foreground">Nouveau statut :</p>
              <p className="font-medium">{PROSPECT_STATUS_LABELS[suggestedStatus]}</p>
            </div>
          )}

          {/* Note */}
          <div className="space-y-2">
            <Label>
              Note {noteRequired ? '*' : '(optionnelle)'}
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={noteRequired ? 'Note obligatoire pour ce résultat...' : 'Ajouter une note...'}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!result || logCall.isPending}>
            {logCall.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer l'appel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
