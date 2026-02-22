import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCreateCalendarEvent } from '../hooks/use-calendar'
import { toast } from 'sonner'

const COLOR_OPTIONS = [
  { value: '#8B5CF6', label: 'Violet' },
  { value: '#3B82F6', label: 'Bleu' },
  { value: '#10B981', label: 'Vert' },
  { value: '#F59E0B', label: 'Orange' },
  { value: '#EF4444', label: 'Rouge' },
  { value: '#EC4899', label: 'Rose' },
  { value: '#6366F1', label: 'Indigo' },
  { value: '#14B8A6', label: 'Turquoise' },
]

interface AddEventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDate?: Date
}

export function AddEventDialog({ open, onOpenChange, defaultDate }: AddEventDialogProps) {
  const createEvent = useCreateCalendarEvent()

  const defaultDateStr = defaultDate
    ? defaultDate.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(defaultDateStr)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [color, setColor] = useState('#8B5CF6')

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setDate(defaultDateStr)
    setStartTime('09:00')
    setEndTime('10:00')
    setColor('#8B5CF6')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    const startAt = new Date(`${date}T${startTime}:00`).toISOString()
    const endAt = endTime ? new Date(`${date}T${endTime}:00`).toISOString() : undefined

    try {
      await createEvent.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        start_at: startAt,
        end_at: endAt,
        color,
      })
      toast.success('Événement ajouté')
      resetForm()
      onOpenChange(false)
    } catch {
      toast.error('Erreur lors de la création')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvel événement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="event-title">Titre *</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Réunion d'équipe, Formation..."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-desc">Description</Label>
            <Textarea
              id="event-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Détails de l'événement..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="event-date">Date *</Label>
              <Input
                id="event-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-start">Début *</Label>
              <Input
                id="event-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-end">Fin</Label>
              <Input
                id="event-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Couleur</Label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    color === c.value ? 'border-foreground scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => setColor(c.value)}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={createEvent.isPending || !title.trim()}>
              {createEvent.isPending ? 'Création...' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
