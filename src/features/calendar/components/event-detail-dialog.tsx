import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollTimePicker } from '@/components/ui/scroll-time-picker'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  useRescheduleRdv,
  useCancelRdv,
  useRescheduleReminder,
  useCompleteReminder,
  useDeleteReminder,
  useDeleteCalendarEvent,
  useUpdateCalendarEvent,
  useUpdateRdvNotes,
  useUpdateReminderNote,
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
  Pencil,
  Save,
} from 'lucide-react'

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

interface EventDetailDialogProps {
  event: CalendarEvent | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EventDetailDialog({ event, open, onOpenChange }: EventDetailDialogProps) {
  const navigate = useNavigate()

  // Reschedule state (for RDV / reminder)
  const [showReschedule, setShowReschedule] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')

  // Edit state for manual events
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editStartTime, setEditStartTime] = useState('')
  const [editEndTime, setEditEndTime] = useState('')
  const [editColor, setEditColor] = useState('')

  // Inline note editing for RDV / reminder
  const [editingNote, setEditingNote] = useState(false)
  const [noteText, setNoteText] = useState('')

  // Mutations
  const rescheduleRdv = useRescheduleRdv()
  const cancelRdv = useCancelRdv()
  const rescheduleReminder = useRescheduleReminder()
  const completeReminder = useCompleteReminder()
  const deleteReminder = useDeleteReminder()
  const deleteManualEvent = useDeleteCalendarEvent()
  const updateManualEvent = useUpdateCalendarEvent()
  const updateRdvNotes = useUpdateRdvNotes()
  const updateReminderNote = useUpdateReminderNote()

  // Reset all edit states when dialog closes or event changes
  useEffect(() => {
    if (!open) {
      setShowReschedule(false)
      setEditing(false)
      setEditingNote(false)
    }
  }, [open])

  if (!event) return null

  const rawId = event.meta?.rawId as string | undefined
  const startDate = parseISO(event.start)
  const rdvType: RdvType | undefined = typeof event.meta?.rdvType === 'string' ? event.meta.rdvType as RdvType : undefined
  const reminderNote = typeof event.meta?.note === 'string' ? event.meta.note : undefined
  const rdvNotes = typeof event.meta?.notes === 'string' ? event.meta.notes : undefined
  const manualDescription = typeof event.meta?.description === 'string' ? event.meta.description : undefined

  const isPending =
    rescheduleRdv.isPending ||
    cancelRdv.isPending ||
    rescheduleReminder.isPending ||
    completeReminder.isPending ||
    deleteReminder.isPending ||
    deleteManualEvent.isPending ||
    updateManualEvent.isPending ||
    updateRdvNotes.isPending ||
    updateReminderNote.isPending

  // --- Handlers ---

  const handleOpenReschedule = () => {
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

  // --- Manual event edit ---

  const handleStartEdit = () => {
    setEditTitle(event.title)
    setEditDesc(manualDescription ?? '')
    setEditDate(format(startDate, 'yyyy-MM-dd'))
    setEditStartTime(format(startDate, 'HH:mm'))
    setEditEndTime(event.end ? format(parseISO(event.end), 'HH:mm') : '')
    setEditColor(event.color)
    setEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!rawId || !editTitle.trim() || !editDate) return
    const start_at = new Date(`${editDate}T${editStartTime || '09:00'}:00`).toISOString()
    const end_at = editEndTime ? new Date(`${editDate}T${editEndTime}:00`).toISOString() : null
    await updateManualEvent.mutateAsync({
      id: rawId,
      updates: {
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        start_at,
        end_at,
        color: editColor,
      },
    })
    setEditing(false)
    onOpenChange(false)
  }

  // --- Note edit for RDV / reminder ---

  const handleStartEditNote = () => {
    setNoteText(event.type === 'rdv' ? (rdvNotes ?? '') : (reminderNote ?? ''))
    setEditingNote(true)
  }

  const handleSaveNote = async () => {
    if (!rawId) return
    if (event.type === 'rdv') {
      await updateRdvNotes.mutateAsync({ id: rawId, notes: noteText.trim() || null })
    } else if (event.type === 'reminder') {
      await updateReminderNote.mutateAsync({ id: rawId, note: noteText.trim() || null })
    }
    setEditingNote(false)
  }

  // --- Render ---

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setShowReschedule(false); setEditing(false); setEditingNote(false) }; onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: editing ? editColor : event.color }} />
            {editing ? (
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="h-7 text-base font-semibold"
                placeholder="Titre de l'événement"
              />
            ) : (
              event.title
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* --- EDIT MODE (manual events) --- */}
          {editing ? (
            <>
              <div className="space-y-2">
                <Label className="text-xs">Description</Label>
                <Textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Détails de l'événement..."
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Date</Label>
                  <Input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Début</Label>
                  <ScrollTimePicker value={editStartTime} onChange={setEditStartTime} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fin</Label>
                  <ScrollTimePicker value={editEndTime} onChange={setEditEndTime} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Couleur</Label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      className={`w-6 h-6 rounded-full border-2 transition-all ${
                        editColor === c.value ? 'border-foreground scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c.value }}
                      onClick={() => setEditColor(c.value)}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* --- READ MODE --- */}
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

              {/* RDV notes (editable) */}
              {event.type === 'rdv' && rawId && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Notes</span>
                    {!editingNote && (
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleStartEditNote}>
                        <Pencil className="h-3 w-3 mr-1" />
                        Modifier
                      </Button>
                    )}
                  </div>
                  {editingNote ? (
                    <div className="space-y-2">
                      <Textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Notes du RDV..."
                        rows={2}
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 text-xs" onClick={handleSaveNote} disabled={isPending}>
                          <Save className="h-3 w-3 mr-1" />
                          Enregistrer
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingNote(false)}>
                          Annuler
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm bg-muted/50 rounded-md p-2 min-h-[32px]">
                      {rdvNotes || <span className="text-muted-foreground italic">Aucune note</span>}
                    </div>
                  )}
                </div>
              )}

              {/* Reminder note (editable) */}
              {event.type === 'reminder' && rawId && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Note</span>
                    {!editingNote && (
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleStartEditNote}>
                        <Pencil className="h-3 w-3 mr-1" />
                        Modifier
                      </Button>
                    )}
                  </div>
                  {editingNote ? (
                    <div className="space-y-2">
                      <Textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Note du rappel..."
                        rows={2}
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 text-xs" onClick={handleSaveNote} disabled={isPending}>
                          <Save className="h-3 w-3 mr-1" />
                          Enregistrer
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingNote(false)}>
                          Annuler
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm bg-muted/50 rounded-md p-2 min-h-[32px]">
                      {reminderNote || <span className="text-muted-foreground italic">Aucune note</span>}
                    </div>
                  )}
                </div>
              )}

              {/* Manual event description (shown in read mode only — edit mode replaces it) */}
              {event.type === 'manual' && !editing && manualDescription && (
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
                      <Label className="text-xs">Date</Label>
                      <Input
                        type="date"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Heure</Label>
                      <ScrollTimePicker
                        value={newTime}
                        onChange={setNewTime}
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
            </>
          )}
        </div>

        {/* Actions */}
        {!showReschedule && (
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {/* Edit mode actions */}
            {editing ? (
              <>
                <Button size="sm" onClick={handleSaveEdit} disabled={isPending || !editTitle.trim() || !editDate}>
                  <Save className="h-4 w-4 mr-1" />
                  {isPending ? 'En cours...' : 'Enregistrer'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  Annuler
                </Button>
              </>
            ) : (
              <>
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
                  <>
                    <Button variant="outline" size="sm" onClick={handleStartEdit} disabled={isPending}>
                      <Pencil className="h-4 w-4 mr-1" />
                      Modifier
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Supprimer
                    </Button>
                  </>
                )}
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
