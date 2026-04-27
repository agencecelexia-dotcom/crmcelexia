import { useEffect, useState } from 'react'
import { Check, Loader2, Undo2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useAuth } from '@/features/auth/hooks/use-auth'
import {
  ACCOMPAGNEMENT_STEP_DESCRIPTIONS,
  ACCOMPAGNEMENT_STEP_LABELS,
} from '@/types/enums'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import {
  useMarkStepDone,
  useMarkStepUndone,
  useUpdateStepNotes,
} from '../hooks/use-accompagnement'
import type { ClientAccompagnementStep } from '@/types'

interface StepValidationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  step: ClientAccompagnementStep | null
}

export function StepValidationDialog({ open, onOpenChange, step }: StepValidationDialogProps) {
  const { profile } = useAuth()
  const markDone = useMarkStepDone()
  const markUndone = useMarkStepUndone()
  const updateNotes = useUpdateStepNotes()

  const [notesDraft, setNotesDraft] = useState('')
  const [resourceUrlDraft, setResourceUrlDraft] = useState('')
  const [confirmUndoOpen, setConfirmUndoOpen] = useState(false)

  // Reset drafts when dialog opens with a new step
  useEffect(() => {
    if (open && step) {
      setNotesDraft(step.notes ?? '')
      setResourceUrlDraft(step.resource_url ?? '')
    }
  }, [open, step?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!step) return null

  const isDone = !!step.completed_at
  const validatorName = step.validator?.full_name ?? null

  async function handleMarkDone() {
    if (!profile || !step) return
    try {
      await markDone.mutateAsync({
        stepId: step.id,
        validatedBy: profile.id,
        clientId: step.client_id,
      })
      toast.success(`"${ACCOMPAGNEMENT_STEP_LABELS[step.step]}" validé`)
    } catch {
      // toast handled by hook
    }
  }

  async function handleMarkUndone() {
    if (!step) return
    try {
      await markUndone.mutateAsync({
        stepId: step.id,
        clientId: step.client_id,
      })
      toast.success('Validation annulée')
      setConfirmUndoOpen(false)
    } catch {
      // toast handled by hook
    }
  }

  async function persistNotes(nextNotes: string, nextUrl: string) {
    if (!step) return
    const notesChanged = nextNotes !== (step.notes ?? '')
    const urlChanged = nextUrl !== (step.resource_url ?? '')
    if (!notesChanged && !urlChanged) return
    try {
      await updateNotes.mutateAsync({
        stepId: step.id,
        notes: nextNotes.trim() === '' ? null : nextNotes,
        resourceUrl: nextUrl.trim() === '' ? null : nextUrl,
        clientId: step.client_id,
      })
    } catch {
      // toast handled by hook
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{ACCOMPAGNEMENT_STEP_LABELS[step.step]}</DialogTitle>
            <DialogDescription>{ACCOMPAGNEMENT_STEP_DESCRIPTIONS[step.step]}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Status / actions */}
            {isDone ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600" />
                  <Badge className="bg-emerald-100 text-emerald-700">Validé</Badge>
                </div>
                <p className="text-sm text-emerald-900">
                  Validé le {formatDate(step.completed_at!)}
                  {validatorName && (
                    <>
                      {' '}
                      par <span className="font-medium">{validatorName}</span>
                    </>
                  )}
                </p>
              </div>
            ) : (
              <Button
                onClick={handleMarkDone}
                disabled={markDone.isPending || !profile}
                className="w-full"
              >
                {markDone.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Marquer comme fait
              </Button>
            )}

            {/* Notes (autosave on blur) */}
            <div className="space-y-1.5">
              <Label htmlFor="step-notes" className="text-xs text-muted-foreground">
                Notes
              </Label>
              <Textarea
                id="step-notes"
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                onBlur={() => persistNotes(notesDraft, resourceUrlDraft)}
                rows={3}
                placeholder="Ajouter des notes sur cette étape..."
              />
            </div>

            {/* Resource URL (autosave on blur) */}
            <div className="space-y-1.5">
              <Label htmlFor="step-resource" className="text-xs text-muted-foreground">
                Lien vers ressource
              </Label>
              <Input
                id="step-resource"
                type="url"
                value={resourceUrlDraft}
                onChange={(e) => setResourceUrlDraft(e.target.value)}
                onBlur={() => persistNotes(notesDraft, resourceUrlDraft)}
                placeholder="https://..."
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {isDone && (
              <Button
                variant="outline"
                onClick={() => setConfirmUndoOpen(true)}
                disabled={markUndone.isPending}
                className="text-amber-700 hover:text-amber-800 border-amber-300 hover:bg-amber-50"
              >
                <Undo2 className="mr-2 h-4 w-4" />
                Annuler la validation
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmUndoOpen}
        onOpenChange={setConfirmUndoOpen}
        title="Annuler la validation ?"
        description={`Cette action remettra "${ACCOMPAGNEMENT_STEP_LABELS[step.step]}" en statut « à faire ».`}
        confirmLabel="Annuler la validation"
        cancelLabel="Garder"
        variant="destructive"
        onConfirm={handleMarkUndone}
      />
    </>
  )
}
