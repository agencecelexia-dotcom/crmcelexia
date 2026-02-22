import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  useRescheduleRdv,
  useCancelRdv,
  useRescheduleReminder,
  useCompleteReminder,
  useDeleteReminder,
  useDeleteCalendarEvent,
} from '../hooks/use-calendar'
import { RDV_STATUS_LABELS, RDV_STATUS_COLORS, RDV_TYPE_LABELS } from '@/types/enums'
import type { RdvStatus, RdvType } from '@/types/enums'
import type { CalendarEvent } from '../services/calendar-service'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Calendar,
  Clock,
  Phone,
  Video,
  MapPin,
  ExternalLink,
  CalendarClock,
  Trash2,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

interface EventDetailDialogProps {
  event: CalendarEvent | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EventDetailDialog({ event, open, onOpenChange }: EventDetailDialogProps) {
  const navigate = useNavigate()
  const [showReschedule, setShowReschedule] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')

  const rescheduleRdv = useRescheduleRdv()
  const cancelRdv = useCancelRdv()
  const rescheduleReminder = useRescheduleReminder()
  const completeReminder = useCompleteReminder()
  const deleteReminder = useDeleteReminder()
  const deleteManualEvent = useDeleteCalendarEvent()

  if (!event) return null

  const rawId = event.meta?.rawId as string | undefined

  const handleOpenReschedule = () => {
    const startDate = parseISO(event.start)
    setNewDate(format(startDate, 'yyyy-MM-dd'))
    setNewTime(format(startDate, 'HH:mm'))
    setShowReschedule(true)
  }

  const handleReschedule = async () => {
    if (!newDate || !newTime || !rawId) return

    const newScheduledAt = new Date(`${newDate}T${newTime}:00`).toISOString()

    if (event.type === 'rdv') {
      await rescheduleRdv.mutateAsync({ rdvId: rawId, newScheduledAt })
    } else if (event.type === 'reminder') {
      await rescheduleReminder.mutateAsync({ id: rawId, remind_at: newScheduledAt })
    }

    setShowReschedule(false)
    onOpenChange(false)
  }

  const handleCancel = async () => {
    if (!rawId) return
    await cancelRdv.mutateAsync(rawId)
    onOpenChange(false)
  }

  const handleComplete = async () => {
    if (!rawId) return
    await completeReminder.mutateAsync(rawId)
    onOpenChange(false)
  }

  const handleDelete = async () => {
    if (!rawId) return

    if (event.type === 'reminder') {
      await deleteReminder.mutateAsync(rawId)
    } else if (event.type === 'manual') {
      await deleteManualEvent.mutateAsync(rawId)
    }

    onOpenChange(false)
  }

  const handleViewProspect = () => {
    if (event.prospectId) {
      onOpenChange(false)
      navigate(`/prospects/${event.prospectId}`)
    }
  }

  const isPending =
    rescheduleRdv.isPending ||
    cancelRdv.isPending ||
    rescheduleReminder.isPending ||
    completeReminder.isPending ||
    deleteReminder.isPending ||
    deleteManualEvent.isPending

  const startDate = parseISO(event.start)
  const rdvType: RdvType | undefined = typeof event.meta?.rdvType === 'string' ? event.meta.rdvType as RdvType : undefined
  const reminderNote = typeof event.meta?.note === 'string' ? event.meta.note : undefined
  const manualDescription = typeof event.meta?.description === 'string' ? event.meta.description : undefined

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setShowReschedule(false); onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: event.color }} />
            {event.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Date & time */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{format(startDate, 'EEEE d MMMM yyyy', { locale: fr })}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              {format(startDate, 'HH:mm')}
              {event.end && ` - ${format(parseISO(event.end), 'HH:mm')}`}
            </span>
          </div>

          {/* RDV-specific info */}
          {event.type === 'rdv' && (
            <>
              {rdvType && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {rdvType === 'telephone' ? <Phone className="h-4 w-4" /> :
                   rdvType === 'visio' ? <Video className="h-4 w-4" /> :
                   <MapPin className="h-4 w-4" />}
                  <span>{RDV_TYPE_LABELS[rdvType]}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Statut :</span>
                <Badge variant="secondary" className={RDV_STATUS_COLORS[event.status as RdvStatus] ?? ''}>
                  {RDV_STATUS_LABELS[event.status as RdvStatus] ?? event.status}
                </Badge>
              </div>
            </>
          )}

          {/* Reminder note */}
          {event.type === 'reminder' && reminderNote && (
            <div className="text-sm bg-muted/50 rounded-md p-2">
              {reminderNote}
            </div>
          )}

          {/* Manual event description */}
          {event.type === 'manual' && manualDescription && (
            <div className="text-sm bg-muted/50 rounded-md p-2">
              {manualDescription}
            </div>
          )}

          {/* Prospect link */}
          {event.prospectId && (
            <Button variant="link" className="p-0 h-auto text-sm" onClick={handleViewProspect}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Voir le prospect
            </Button>
          )}

          {/* Reschedule form */}
          {showReschedule && (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <p className="text-sm font-medium">
                {event.type === 'rdv'
                  ? 'Reprogrammer le RDV (ancien = no-show)'
                  : 'Reprogrammer le rappel'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="reschedule-date" className="text-xs">Date</Label>
                  <Input
                    id="reschedule-date"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reschedule-time" className="text-xs">Heure</Label>
                  <Input
                    id="reschedule-time"
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleReschedule} disabled={isPending || !newDate || !newTime}>
                  {isPending ? 'En cours...' : 'Confirmer'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowReschedule(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {!showReschedule && (
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {/* RDV actions */}
            {event.type === 'rdv' && rawId && !['annule', 'no_show', 'fait', 'close', 'perdu'].includes(event.status) && (
              <>
                <Button variant="outline" size="sm" onClick={handleOpenReschedule} disabled={isPending}>
                  <CalendarClock className="h-4 w-4 mr-1" />
                  Reprogrammer
                </Button>
                <Button variant="destructive" size="sm" onClick={handleCancel} disabled={isPending}>
                  <XCircle className="h-4 w-4 mr-1" />
                  Annuler le RDV
                </Button>
              </>
            )}

            {/* Reminder actions */}
            {event.type === 'reminder' && rawId && (
              <>
                <Button variant="outline" size="sm" onClick={handleOpenReschedule} disabled={isPending}>
                  <CalendarClock className="h-4 w-4 mr-1" />
                  Reprogrammer
                </Button>
                <Button variant="default" size="sm" onClick={handleComplete} disabled={isPending}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Marquer fait
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Supprimer
                </Button>
              </>
            )}

            {/* Manual event actions */}
            {event.type === 'manual' && rawId && (
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
                <Trash2 className="h-4 w-4 mr-1" />
                Supprimer
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
