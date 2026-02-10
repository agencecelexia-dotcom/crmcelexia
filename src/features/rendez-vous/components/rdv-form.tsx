import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useCreateRdv } from '../hooks/use-rdv'
import type { Prospect } from '@/types'
import type { RdvType } from '@/types/enums'
import { RDV_TYPE_LABELS } from '@/types/enums'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CalendarDays, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface RdvFormProps {
  prospect: Prospect
  open: boolean
  onOpenChange: (open: boolean) => void
  callId?: string | null
}

export function RdvForm({ prospect, open, onOpenChange, callId }: RdvFormProps) {
  const { profile } = useAuth()
  const createRdv = useCreateRdv()

  const [type, setType] = useState<RdvType>('telephone')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('10:00')
  const [duration, setDuration] = useState('30')
  const [location, setLocation] = useState('')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [notes, setNotes] = useState('')

  function reset() {
    setType('telephone')
    setDate('')
    setTime('10:00')
    setDuration('30')
    setLocation('')
    setMeetingUrl('')
    setNotes('')
  }

  async function handleSubmit() {
    if (!date || !time) {
      toast.error('La date et l\'heure sont obligatoires')
      return
    }
    if (!profile) return

    const scheduledAt = new Date(`${date}T${time}`).toISOString()

    try {
      await createRdv.mutateAsync({
        prospect_id: prospect.id,
        commercial_id: profile.id,
        scheduled_at: scheduledAt,
        duration_minutes: parseInt(duration) || 30,
        type,
        location: location.trim() || null,
        meeting_url: meetingUrl.trim() || null,
        notes: notes.trim() || null,
        created_from_call_id: callId ?? null,
      })
      toast.success('Rendez-vous créé')
      reset()
      onOpenChange(false)
    } catch {
      toast.error('Erreur lors de la création du RDV')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Planifier un RDV
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Prospect info */}
          <div className="rounded-lg bg-muted p-3">
            <p className="font-medium">{prospect.company_name}</p>
            {prospect.contact_name && (
              <p className="text-sm text-muted-foreground">
                {prospect.contact_firstname} {prospect.contact_name}
              </p>
            )}
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label>Type de RDV *</Label>
            <Select value={type} onValueChange={(v) => setType(v as RdvType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(RDV_TYPE_LABELS) as [RdvType, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="space-y-2">
              <Label>Heure *</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label>Durée (minutes)</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 min</SelectItem>
                <SelectItem value="30">30 min</SelectItem>
                <SelectItem value="45">45 min</SelectItem>
                <SelectItem value="60">1 heure</SelectItem>
                <SelectItem value="90">1h30</SelectItem>
                <SelectItem value="120">2 heures</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Location (for presentiel) */}
          {type === 'presentiel' && (
            <div className="space-y-2">
              <Label>Lieu</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Adresse du RDV..."
              />
            </div>
          )}

          {/* Meeting URL (for visio) */}
          {type === 'visio' && (
            <div className="space-y-2">
              <Label>Lien de la visio</Label>
              <Input
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://meet.google.com/..."
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes sur le RDV..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!date || !time || createRdv.isPending}>
            {createRdv.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer le RDV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
