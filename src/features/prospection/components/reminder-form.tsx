import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useCreateReminder } from '../hooks/use-reminders'
import { useLogCall } from '../hooks/use-calls'
import type { Prospect } from '@/types'
import type { CallResult, ProspectStatus } from '@/types/enums'
import {
  CALL_RESULT_TO_STATUS,
  PROSPECT_STATUS_TRANSITIONS,
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
import { Input } from '@/components/ui/input'
import { ScrollTimePicker } from '@/components/ui/scroll-time-picker'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Clock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ReminderFormProps {
  prospect: Prospect
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReminderForm({ prospect, open, onOpenChange }: ReminderFormProps) {
  const { profile } = useAuth()
  const createReminder = useCreateReminder()
  const logCall = useLogCall()

  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [note, setNote] = useState('')

  // Détermine si le statut sera conservé (pipeline avancé) ou changé vers `a_rappeler`.
  const currentStatus = prospect.status as ProspectStatus
  const targetStatus = CALL_RESULT_TO_STATUS['reached_callback']
  const validTargets = PROSPECT_STATUS_TRANSITIONS[currentStatus] ?? []
  const statusKept = !validTargets.includes(targetStatus) && currentStatus !== targetStatus

  function reset() {
    setDate('')
    setTime('09:00')
    setNote('')
  }

  async function handleSubmit() {
    if (!date) {
      toast.error('La date est obligatoire')
      return
    }
    if (!note.trim()) {
      toast.error('Une note est obligatoire')
      return
    }
    if (!profile) return

    const remindAt = new Date(`${date}T${time}:00`).toISOString()
    const newStatus: ProspectStatus = statusKept ? currentStatus : targetStatus

    try {
      await logCall.mutateAsync({
        prospect_id: prospect.id,
        commercial_id: profile.id,
        result: 'reached_callback' as CallResult,
        new_status: newStatus,
        note: note.trim(),
      })

      await createReminder.mutateAsync({
        prospect_id: prospect.id,
        commercial_id: profile.id,
        remind_at: remindAt,
        note: note.trim(),
      })

      if (statusKept) {
        toast.success(`Rappel planifié — statut conservé (${PROSPECT_STATUS_LABELS[currentStatus]})`)
      } else {
        toast.success('Appel enregistré + rappel créé')
      }
      reset()
      onOpenChange(false)
    } catch {
      toast.error('Erreur lors de la création du rappel')
    }
  }

  const minDate = new Date().toISOString().split('T')[0]
  const submitting = logCall.isPending || createReminder.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            À rappeler après appel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted p-3">
            <p className="font-medium">{prospect.company_name}</p>
            {(prospect.contact_firstname || prospect.contact_name) && (
              <p className="text-sm text-muted-foreground">
                {[prospect.contact_firstname, prospect.contact_name].filter(Boolean).join(' ')}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {statusKept
                ? `Statut conservé : ${PROSPECT_STATUS_LABELS[currentStatus]}`
                : `Statut → ${PROSPECT_STATUS_LABELS[targetStatus]}`}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={minDate}
              />
            </div>
            <div className="space-y-2">
              <Label>Heure</Label>
              <ScrollTimePicker
                value={time}
                onChange={setTime}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Note *</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Pourquoi rappeler (résumé de l'appel)..."
              rows={2}
            />
          </div>

          {date && (
            <p className="text-sm text-muted-foreground">
              Rappel le {new Date(`${date}T${time}`).toLocaleDateString('fr-FR', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })} à {time}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!date || !note.trim() || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Planifier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
