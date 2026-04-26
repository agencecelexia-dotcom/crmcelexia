import { useEffect, useState, type ReactNode } from 'react'
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
import { LOSS_REASON_LABELS, DEATH_REASON_LABELS } from '@/types/enums'

export interface TerminalStatusDialogProps {
  /** Controlled open state */
  open: boolean
  /** Called when the dialog requests open/close (Esc, overlay click, Cancel button). */
  onOpenChange: (open: boolean) => void
  /**
   * Determines which set of labels is shown:
   * - 'lost' → LOSS_REASON_LABELS (perte commerciale)
   * - 'dead' → DEATH_REASON_LABELS (prospect mort)
   */
  mode: 'lost' | 'dead'
  /**
   * Confirmation callback. Receives the selected reason value and the optional note.
   * Parent is responsible for performing the mutation; the dialog only manages local
   * form state and resets it after a successful confirm/cancel.
   */
  onConfirm: (reason: string, note?: string) => void
  /** Disable the confirm button (e.g. while a mutation is pending). */
  isPending?: boolean
  /** Override the default title. */
  title?: string
  /** Optional description/help text shown above the form fields. */
  description?: string
  /** Override the default confirm button label. */
  confirmLabel?: string
  /** Override the default Cancel button label. */
  cancelLabel?: string
  /**
   * Extra content rendered between the note Textarea and the footer
   * (e.g. an optional "schedule a recall" section). The content is responsible
   * for its own state — it is not reset by this component.
   */
  extraContent?: ReactNode
  /** Called when the dialog finishes (after confirm OR cancel) so the parent can reset its own extra state. */
  onClose?: () => void
  /**
   * Optional initial reason to seed the Select with when the dialog opens
   * (e.g. when editing an existing saved reason). Re-applied each time `open` flips to true.
   */
  initialReason?: string
  /** Optional initial note to seed the Textarea with when the dialog opens. */
  initialNote?: string
}

const DEFAULT_TITLES: Record<TerminalStatusDialogProps['mode'], string> = {
  lost: 'Raison de la perte',
  dead: 'Raison de la mort',
}

const DEFAULT_CONFIRM_LABELS: Record<TerminalStatusDialogProps['mode'], string> = {
  lost: 'Confirmer la perte',
  dead: 'Confirmer',
}

/**
 * Shared dialog for terminal prospect/opportunity statuses (lost / dead).
 *
 * UX contract:
 * - Reason select is mandatory (confirm button disabled until set)
 * - Note textarea is optional
 * - Local state (reason + note) is reset whenever the dialog closes,
 *   whether confirmed or cancelled, so the next open starts fresh.
 * - Use `extraContent` for callsite-specific extras (e.g. "schedule a recall")
 *   and pair it with `onClose` to reset that extra state.
 */
export function TerminalStatusDialog({
  open,
  onOpenChange,
  mode,
  onConfirm,
  isPending = false,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Annuler',
  extraContent,
  onClose,
  initialReason,
  initialNote,
}: TerminalStatusDialogProps) {
  const [reason, setReason] = useState<string>('')
  const [note, setNote] = useState<string>('')

  const labels = mode === 'lost' ? LOSS_REASON_LABELS : DEATH_REASON_LABELS

  // Reset local state every time the dialog closes so reopening starts fresh.
  // When opening, seed with the optional initial values (used for editing flows).
  useEffect(() => {
    if (open) {
      setReason(initialReason ?? '')
      setNote(initialNote ?? '')
    } else {
      setReason('')
      setNote('')
    }
  }, [open, initialReason, initialNote])

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      onClose?.()
    }
    onOpenChange(next)
  }

  const handleCancel = () => {
    onClose?.()
    onOpenChange(false)
  }

  const handleConfirm = () => {
    if (!reason) return
    onConfirm(reason, note.trim() ? note.trim() : undefined)
    // Closing is the parent's responsibility (it may want to keep the dialog open
    // until the mutation succeeds); we still emit onClose so callers can reset
    // their own extra state if they choose to close synchronously.
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title ?? DEFAULT_TITLES[mode]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
          <div className="space-y-2">
            <Label>Raison *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une raison..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(labels).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Détails supplémentaires..."
              rows={2}
            />
          </div>
          {extraContent}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={handleCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!reason || isPending}
          >
            {confirmLabel ?? DEFAULT_CONFIRM_LABELS[mode]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
