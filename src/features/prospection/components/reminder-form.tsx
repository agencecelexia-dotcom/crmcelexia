import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useCreateReminder } from '../hooks/use-reminders'
import type { Prospect } from '@/types'
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

  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [note, setNote] = useState('')

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
    if (!profile) return

    const remindAt = new Date(`${date}T${time}:00`).toISOString()

    try {
      await createReminder.mutateAsync({
        prospect_id: prospect.id,
        commercial_id: profile.id,
        remind_at: remindAt,
        note: note.trim() || null,
      })
      toast.success('Rappel planifié')
      reset()
      onOpenChange(false)
    } catch {
      toast.error('Erreur lors de la création du rappel')
    }
  }

  // Default date to tomorrow
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = new Date().toISOString().split('T')[0]

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Planifier un rappel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted p-3">
            <p className="font-medium">{prospect.company_name}</p>
            <p className="text-sm text-muted-foreground">
              {prospect.contact_firstname} {prospect.contact_name}
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
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Note (optionnelle)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Raison du rappel..."
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
          <Button onClick={handleSubmit} disabled={!date || createReminder.isPending}>
            {createReminder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Planifier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
