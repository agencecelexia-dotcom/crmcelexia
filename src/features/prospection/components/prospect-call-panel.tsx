import { useState, useMemo } from 'react'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useLogCall } from '../hooks/use-calls'
import { useUpdateProspect } from '../hooks/use-prospects'
import { useCreateReminder } from '../hooks/use-reminders'
import { useRdvForProspect } from '@/features/rendez-vous/hooks/use-rdv'
import { useCallsForProspect } from '../hooks/use-calls'
import { useRemindersForProspect, useCompleteReminder } from '../hooks/use-reminders'
import type { Prospect } from '@/types'
import type { CallResult, ProspectStatus } from '@/types/enums'
import {
  CALL_RESULT_TO_STATUS,
  PROSPECT_STATUS_TRANSITIONS,
  CALL_RESULTS_REQUIRING_NOTE,
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUS_COLORS,
  CALL_RESULT_LABELS,
  RDV_TYPE_LABELS,
} from '@/types/enums'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { ScrollTimePicker } from '@/components/ui/scroll-time-picker'
import { formatPhone, formatDate, formatRelative } from '@/lib/format'
import {
  X,
  Phone,
  PhoneOff,
  Voicemail,
  ThumbsDown,
  CalendarPlus,
  Clock,
  ArrowRight,
  Loader2,
  ExternalLink,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Save,
  PhoneCall,
  FileText,
  Send,
  Globe,
} from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { useCalcomLink, buildCalcomUrl } from '@/hooks/use-calcom'
import { useUndo } from '@/hooks/use-undo'

interface ProspectCallPanelProps {
  prospect: Prospect
  onClose: () => void
  onCallLogged?: () => void
}

const QUICK_CALL_ACTIONS: { result: CallResult; label: string; icon: typeof Phone; color: string }[] = [
  { result: 'voicemail', label: 'Messagerie', icon: Voicemail, color: 'bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200' },
  { result: 'reached_not_interested', label: 'Pas intéressé', icon: ThumbsDown, color: 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200' },
  { result: 'reached_callback', label: 'À rappeler', icon: Clock, color: 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200' },
  { result: 'reached_rdv', label: 'RDV pris', icon: CalendarPlus, color: 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200' },
  { result: 'wrong_number', label: 'Faux numéro', icon: PhoneOff, color: 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200' },
]

export function ProspectCallPanel({ prospect, onClose, onCallLogged }: ProspectCallPanelProps) {
  const { profile } = useAuth()
  const logCall = useLogCall()
  const updateProspect = useUpdateProspect()
  const createReminder = useCreateReminder()
  const completeReminder = useCompleteReminder()
  const { setUndoAction } = useUndo()

  const { data: calls } = useCallsForProspect(prospect.id)
  const { data: reminders } = useRemindersForProspect(prospect.id)
  const { data: rdvs } = useRdvForProspect(prospect.id)
  const { data: calcomLink } = useCalcomLink()

  const [prospectNotes, setProspectNotes] = useState(prospect.notes ?? '')
  const [notesChanged, setNotesChanged] = useState(false)
  const [showReminderInput, setShowReminderInput] = useState(false)
  const [reminderDate, setReminderDate] = useState('')
  const [reminderTime, setReminderTime] = useState('09:00')
  const [reminderNote, setReminderNote] = useState('')

  // "À rappeler" inline form state
  const [rappelerOpen, setRappelerOpen] = useState(false)
  const [rappelerDate, setRappelerDate] = useState('')
  const [rappelerTime, setRappelerTime] = useState('09:00')
  const [rappelerNote, setRappelerNote] = useState('')

  // "Pas intéressé" (and other note-required results) inline note dialog state
  const [noteDialogOpen, setNoteDialogOpen] = useState(false)
  const [noteDialogResult, setNoteDialogResult] = useState<CallResult | null>(null)
  const [noteDialogText, setNoteDialogText] = useState('')

  // "Site envoyé" inline form state
  const [siteEnvoyeOpen, setSiteEnvoyeOpen] = useState(false)
  const [siteEnvoyeUrl, setSiteEnvoyeUrl] = useState('')
  const [siteEnvoyeDate, setSiteEnvoyeDate] = useState('')

  // Website URL inline edit
  const [editingUrl, setEditingUrl] = useState(false)
  const [urlInput, setUrlInput] = useState('')

  const recentCalls = calls?.slice(0, 5) ?? []
  const pendingReminders = reminders?.filter((r) => !r.is_completed) ?? []
  const upcomingRdvs = rdvs?.filter((r) => r.status === 'prevu') ?? []

  // Filter quick actions based on valid status transitions
  const availableQuickActions = useMemo(() => {
    const currentStatus = prospect.status as ProspectStatus
    const validTargets = PROSPECT_STATUS_TRANSITIONS[currentStatus] ?? []
    if (currentStatus === 'converti_client') return []
    return QUICK_CALL_ACTIONS.filter(({ result }) => {
      const targetStatus = CALL_RESULT_TO_STATUS[result]
      return validTargets.includes(targetStatus) || targetStatus === currentStatus
    })
  }, [prospect.status])

  async function handleQuickCall(result: CallResult) {
    if (!profile) return

    // "À rappeler" → open inline rappeler form instead of logging immediately
    if (result === 'reached_callback') {
      setRappelerOpen(true)
      setNoteDialogOpen(false)
      return
    }

    // Results requiring a note → open inline note dialog
    const needsNote = CALL_RESULTS_REQUIRING_NOTE.includes(result)
    if (needsNote) {
      setNoteDialogOpen(true)
      setNoteDialogResult(result)
      setNoteDialogText('')
      setRappelerOpen(false)
      return
    }

    const newStatus = CALL_RESULT_TO_STATUS[result]

    try {
      await logCall.mutateAsync({
        prospect_id: prospect.id,
        commercial_id: profile.id,
        result,
        new_status: newStatus,
        note: null,
      })
      toast.success(`Appel enregistré — ${PROSPECT_STATUS_LABELS[newStatus]}`)

      // Register undo action to revert status
      const previousStatus = prospect.status
      setUndoAction({
        label: `Annuler: ${prospect.company_name} → ${PROSPECT_STATUS_LABELS[newStatus]}`,
        undo: async () => {
          await updateProspect.mutateAsync({
            id: prospect.id,
            updates: { status: previousStatus },
          })
        },
      })

      // "RDV pris" → open Cal.com to book, webhook creates the RDV automatically
      if (result === 'reached_rdv') {
        if (calcomLink) {
          const bookingUrl = buildCalcomUrl(calcomLink, prospect)
          if (bookingUrl) {
            window.open(bookingUrl, '_blank', 'noopener,noreferrer')
            toast.info('Réservez un créneau sur Cal.com — le RDV sera créé automatiquement')
          }
        } else {
          toast.warning('Cal.com non configuré — pensez à créer le RDV manuellement depuis la fiche prospect')
        }
      }

      onCallLogged?.()
    } catch {
      toast.error("Erreur lors de l'enregistrement")
    }
  }

  async function handleConfirmRappeler() {
    if (!profile || !rappelerDate || !rappelerNote.trim()) return

    const newStatus = CALL_RESULT_TO_STATUS['reached_callback']
    const remindAt = `${rappelerDate}T${rappelerTime}:00`

    try {
      await logCall.mutateAsync({
        prospect_id: prospect.id,
        commercial_id: profile.id,
        result: 'reached_callback' as CallResult,
        new_status: newStatus,
        note: rappelerNote.trim(),
      })

      await createReminder.mutateAsync({
        prospect_id: prospect.id,
        commercial_id: profile.id,
        remind_at: remindAt,
        note: rappelerNote.trim(),
      })

      toast.success('Appel enregistré + rappel créé')

      // Register undo action to revert status
      const previousStatus = prospect.status
      setUndoAction({
        label: `Annuler: ${prospect.company_name} → À rappeler`,
        undo: async () => {
          await updateProspect.mutateAsync({
            id: prospect.id,
            updates: { status: previousStatus },
          })
        },
      })

      setRappelerOpen(false)
      setRappelerDate('')
      setRappelerTime('09:00')
      setRappelerNote('')
      onCallLogged?.()
    } catch {
      toast.error("Erreur lors de l'enregistrement")
    }
  }

  async function handleConfirmNoteDialog() {
    if (!profile || !noteDialogResult || !noteDialogText.trim()) return

    const result = noteDialogResult
    const newStatus = CALL_RESULT_TO_STATUS[result]

    try {
      await logCall.mutateAsync({
        prospect_id: prospect.id,
        commercial_id: profile.id,
        result,
        new_status: newStatus,
        note: noteDialogText.trim(),
      })
      toast.success(`Appel enregistré — ${PROSPECT_STATUS_LABELS[newStatus]}`)

      // Register undo action to revert status
      const previousStatus = prospect.status
      setUndoAction({
        label: `Annuler: ${prospect.company_name} → ${PROSPECT_STATUS_LABELS[newStatus]}`,
        undo: async () => {
          await updateProspect.mutateAsync({
            id: prospect.id,
            updates: { status: previousStatus },
          })
        },
      })

      setNoteDialogOpen(false)
      setNoteDialogResult(null)
      setNoteDialogText('')
      onCallLogged?.()
    } catch {
      toast.error("Erreur lors de l'enregistrement")
    }
  }

  async function handleSaveNotes() {
    try {
      await updateProspect.mutateAsync({
        id: prospect.id,
        updates: { notes: prospectNotes.trim() || null },
      })
      setNotesChanged(false)
      toast.success('Notes sauvegardées')
    } catch {
      toast.error('Erreur')
    }
  }

  async function handleAddReminder() {
    if (!reminderDate || !profile) return

    try {
      const remindAt = `${reminderDate}T${reminderTime}:00`
      await createReminder.mutateAsync({
        prospect_id: prospect.id,
        commercial_id: profile.id,
        remind_at: remindAt,
        note: reminderNote.trim() || null,
      })
      toast.success('Rappel créé')
      setShowReminderInput(false)
      setReminderDate('')
      setReminderNote('')
    } catch {
      toast.error('Erreur')
    }
  }

  return (
    <div className="flex flex-col h-full border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div className="min-w-0">
          <h2 className="font-bold text-lg truncate">{prospect.company_name}</h2>
          {(prospect.contact_firstname || prospect.contact_name) && (
            <p className="text-sm text-muted-foreground truncate">
              {[prospect.contact_firstname, prospect.contact_name].filter(Boolean).join(' ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={`/prospects/${prospect.id}`}
            className="text-muted-foreground hover:text-foreground"
            title="Ouvrir la fiche"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Phone + Status */}
        <div className="p-4 border-b">
          <a
            href={`tel:${prospect.phone}`}
            className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors group"
          >
            <div className="p-2 rounded-full bg-primary/10 group-hover:bg-primary/20">
              <Phone className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xl font-mono font-bold text-primary">
              {formatPhone(prospect.phone)}
            </span>
          </a>

          <div className="flex items-center gap-2 mt-3">
            <StatusBadge
              label={PROSPECT_STATUS_LABELS[prospect.status]}
              colorClass={PROSPECT_STATUS_COLORS[prospect.status]}
            />
            <span className="text-xs text-muted-foreground">
              {prospect.call_count} appel{prospect.call_count !== 1 ? 's' : ''}
            </span>
            {prospect.last_called_at && (
              <span className="text-xs text-muted-foreground">
                — {formatRelative(prospect.last_called_at)}
              </span>
            )}
          </div>

          {/* Quick info */}
          <div className="mt-3 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
            {prospect.profession && <span>{prospect.profession}</span>}
            {prospect.city && <span>{prospect.city}</span>}
            {prospect.contact_email && (
              <a href={`mailto:${prospect.contact_email}`} className="text-primary hover:underline truncate col-span-2">
                {prospect.contact_email}
              </a>
            )}
          </div>
        </div>

        {/* Overdue Reminders Alert */}
        {pendingReminders.some((r) => new Date(r.remind_at) < new Date()) && (
          <div className="mx-4 mt-3 p-2 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-medium">Rappel en retard</span>
          </div>
        )}

        {/* Quick Call Actions */}
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <PhoneCall className="h-4 w-4" />
            Résultat de l'appel
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {availableQuickActions.map(({ result, label, icon: Icon, color }) => (
              <button
                key={result}
                onClick={() => handleQuickCall(result)}
                disabled={logCall.isPending}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${color} disabled:opacity-50`}
              >
                {logCall.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                {label}
              </button>
            ))}
          </div>

          {/* "Site en attente" — direct status change (not a call result) */}
          {(['nouveau', 'appele_sans_reponse', 'messagerie', 'a_rappeler'] as ProspectStatus[]).includes(prospect.status as ProspectStatus) && (
            <button
              onClick={async () => {
                if (!profile) return
                const previousStatus = prospect.status
                try {
                  await updateProspect.mutateAsync({
                    id: prospect.id,
                    updates: { status: 'site_en_attente' },
                  })
                  toast.success('Statut → Site en attente')
                  setUndoAction({
                    label: `Annuler: ${prospect.company_name} → Site en attente`,
                    undo: async () => {
                      await updateProspect.mutateAsync({
                        id: prospect.id,
                        updates: { status: previousStatus },
                      })
                    },
                  })
                  onCallLogged?.()
                } catch {
                  toast.error('Erreur lors du changement de statut')
                }
              }}
              disabled={updateProspect.isPending}
              className="mt-2 flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 text-sm font-medium text-cyan-700 transition-colors disabled:opacity-50"
            >
              {updateProspect.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Site en attente
            </button>
          )}

          {/* "Site envoyé" — for site_en_attente prospects, requires URL + date */}
          {prospect.status === 'site_en_attente' && !siteEnvoyeOpen && (
            <button
              onClick={() => {
                setSiteEnvoyeUrl(prospect.website ?? '')
                setSiteEnvoyeDate(new Date().toISOString().split('T')[0])
                setSiteEnvoyeOpen(true)
              }}
              className="mt-2 flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-sm font-medium text-blue-700 transition-colors"
            >
              <Send className="h-4 w-4" />
              Site envoyé
            </button>
          )}

          {/* "Site envoyé" inline form */}
          {siteEnvoyeOpen && (
            <div className="mt-3 p-3 rounded-lg border border-blue-200 bg-blue-50/50 space-y-2">
              <p className="text-sm font-medium text-blue-700">Marquer le site comme envoyé</p>
              <Input
                type="url"
                value={siteEnvoyeUrl}
                onChange={(e) => setSiteEnvoyeUrl(e.target.value)}
                placeholder="https://exemple.vercel.app"
                className="h-8 text-sm"
              />
              <Input
                type="date"
                value={siteEnvoyeDate}
                onChange={(e) => setSiteEnvoyeDate(e.target.value)}
                className="h-8 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!siteEnvoyeUrl.trim() || !siteEnvoyeDate) return
                    const previousStatus = prospect.status
                    const previousWebsite = prospect.website
                    try {
                      await updateProspect.mutateAsync({
                        id: prospect.id,
                        updates: { status: 'site_envoye', website: siteEnvoyeUrl.trim(), date_envoi_site: siteEnvoyeDate },
                      })
                      toast.success('Statut → Site envoyé')
                      setUndoAction({
                        label: `Annuler: ${prospect.company_name} → Site envoyé`,
                        undo: async () => {
                          await updateProspect.mutateAsync({
                            id: prospect.id,
                            updates: { status: previousStatus, website: previousWebsite ?? null, date_envoi_site: null },
                          })
                        },
                      })
                      setSiteEnvoyeOpen(false)
                      setSiteEnvoyeUrl('')
                      setSiteEnvoyeDate('')
                      onCallLogged?.()
                    } catch {
                      toast.error('Erreur lors du changement de statut')
                    }
                  }}
                  disabled={!siteEnvoyeUrl.trim() || !siteEnvoyeDate || updateProspect.isPending}
                  className="h-7 text-xs"
                >
                  {updateProspect.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                  )}
                  Confirmer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setSiteEnvoyeOpen(false); setSiteEnvoyeUrl(''); setSiteEnvoyeDate('') }}
                  className="h-7 text-xs"
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {/* Website URL inline edit — quick way to add/update site URL */}
          {(['site_en_attente', 'site_envoye', 'rdv_pris'] as ProspectStatus[]).includes(prospect.status as ProspectStatus) && (
            <div className="mt-3">
              {prospect.website && !editingUrl ? (
                <div className="flex items-center gap-2 text-xs">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <a
                    href={prospect.website.startsWith('http') ? prospect.website : `https://${prospect.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline truncate"
                  >
                    {prospect.website}
                  </a>
                  <button
                    onClick={() => { setUrlInput(prospect.website ?? ''); setEditingUrl(true) }}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    title="Modifier l'URL"
                  >
                    <Save className="h-3 w-3" />
                  </button>
                </div>
              ) : !editingUrl ? (
                <button
                  onClick={() => { setUrlInput(''); setEditingUrl(true) }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Globe className="h-3.5 w-3.5" />
                  + Ajouter l'URL du site
                </button>
              ) : (
                <div className="flex gap-1.5">
                  <Input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://..."
                    className="h-7 text-xs flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && urlInput.trim()) {
                        updateProspect.mutateAsync({
                          id: prospect.id,
                          updates: { website: urlInput.trim() },
                        }).then(() => {
                          toast.success('URL sauvegardée')
                          setEditingUrl(false)
                        }).catch(() => toast.error('Erreur'))
                      } else if (e.key === 'Escape') {
                        setEditingUrl(false)
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-7 px-2"
                    disabled={!urlInput.trim() || updateProspect.isPending}
                    onClick={async () => {
                      try {
                        await updateProspect.mutateAsync({
                          id: prospect.id,
                          updates: { website: urlInput.trim() },
                        })
                        toast.success('URL sauvegardée')
                        setEditingUrl(false)
                      } catch {
                        toast.error('Erreur')
                      }
                    }}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => setEditingUrl(false)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* "À rappeler" inline form */}
          {rappelerOpen && (
            <div className="mt-3 p-3 rounded-lg border border-purple-200 bg-purple-50/50 space-y-2">
              <p className="text-sm font-medium text-purple-700">Planifier le rappel</p>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={rappelerDate}
                  onChange={(e) => setRappelerDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="h-8 text-sm"
                />
                <ScrollTimePicker
                  value={rappelerTime}
                  onChange={setRappelerTime}
                  className="h-8 text-sm w-24"
                />
              </div>
              <Textarea
                value={rappelerNote}
                onChange={(e) => setRappelerNote(e.target.value)}
                placeholder="Note (obligatoire)..."
                rows={2}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleConfirmRappeler}
                  disabled={!rappelerDate || !rappelerNote.trim() || logCall.isPending || createReminder.isPending}
                  className="h-7 text-xs"
                >
                  {(logCall.isPending || createReminder.isPending) ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                  )}
                  Confirmer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRappelerOpen(false)
                    setRappelerDate('')
                    setRappelerTime('09:00')
                    setRappelerNote('')
                  }}
                  className="h-7 text-xs"
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {/* Inline note dialog for results requiring a note (e.g. "Pas intéressé") */}
          {noteDialogOpen && noteDialogResult && (
            <div className="mt-3 p-3 rounded-lg border border-red-200 bg-red-50/50 space-y-2">
              <p className="text-sm font-medium text-red-700">
                Ajoutez une note pour &laquo;&nbsp;{CALL_RESULT_LABELS[noteDialogResult]}&nbsp;&raquo;
              </p>
              <Textarea
                value={noteDialogText}
                onChange={(e) => setNoteDialogText(e.target.value)}
                placeholder="Note (obligatoire)..."
                rows={2}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleConfirmNoteDialog}
                  disabled={!noteDialogText.trim() || logCall.isPending}
                  className="h-7 text-xs"
                >
                  {logCall.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                  )}
                  Confirmer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNoteDialogOpen(false)
                    setNoteDialogResult(null)
                    setNoteDialogText('')
                  }}
                  className="h-7 text-xs"
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {/* Cal.com direct booking — always available when configured */}
          {calcomLink && (
            <button
              onClick={() => {
                const bookingUrl = buildCalcomUrl(calcomLink, prospect)
                if (bookingUrl) {
                  window.open(bookingUrl, '_blank', 'noopener,noreferrer')
                  toast.info('Réservez un créneau — le RDV sera créé automatiquement')
                }
              }}
              className="mt-3 flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 text-sm font-medium text-primary transition-colors"
            >
              <CalendarPlus className="h-4 w-4" />
              Réserver un créneau (Cal.com)
            </button>
          )}
        </div>

        {/* Prospect Notes */}
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Notes du prospect
          </h3>
          <Textarea
            value={prospectNotes}
            onChange={(e) => {
              setProspectNotes(e.target.value)
              setNotesChanged(true)
            }}
            placeholder="Ajouter des notes..."
            rows={3}
            className="text-sm"
          />
          {notesChanged && (
            <Button
              size="sm"
              className="mt-2"
              onClick={handleSaveNotes}
              disabled={updateProspect.isPending}
            >
              {updateProspect.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Save className="h-3 w-3 mr-1" />
              )}
              Sauvegarder
            </Button>
          )}
        </div>

        {/* Reminders */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Rappels
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReminderInput(!showReminderInput)}
              className="h-7 text-xs"
            >
              + Rappel
            </Button>
          </div>

          {showReminderInput && (
            <div className="mb-3 p-3 rounded-lg border bg-muted/30 space-y-2">
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="h-8 text-sm"
                />
                <ScrollTimePicker
                  value={reminderTime}
                  onChange={setReminderTime}
                  className="h-8 text-sm w-24"
                />
              </div>
              <Input
                value={reminderNote}
                onChange={(e) => setReminderNote(e.target.value)}
                placeholder="Note..."
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                onClick={handleAddReminder}
                disabled={!reminderDate || createReminder.isPending}
                className="h-7 text-xs"
              >
                Créer
              </Button>
            </div>
          )}

          {pendingReminders.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun rappel en cours</p>
          ) : (
            <div className="space-y-1.5">
              {pendingReminders.map((r) => {
                const isOverdue = new Date(r.remind_at) < new Date()
                return (
                  <div
                    key={r.id}
                    className={`flex items-center justify-between text-xs p-2 rounded-lg border ${
                      isOverdue ? 'bg-red-50 border-red-200 text-red-700' : 'bg-muted/30'
                    }`}
                  >
                    <div>
                      <span className="font-medium">{formatDate(r.remind_at)}</span>
                      {r.note && <p className="text-muted-foreground mt-0.5">{r.note}</p>}
                    </div>
                    <button
                      onClick={() => completeReminder.mutate({ id: r.id, prospectId: prospect.id })}
                      className="p-1 hover:bg-green-100 rounded"
                      title="Terminer"
                    >
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Upcoming RDVs */}
        {upcomingRdvs.length > 0 && (
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <CalendarPlus className="h-4 w-4" />
              RDV à venir
            </h3>
            <div className="space-y-1.5">
              {upcomingRdvs.map((rdv) => (
                <div key={rdv.id} className="text-xs p-2 rounded-lg border bg-blue-50 border-blue-200">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatDate(rdv.scheduled_at)}</span>
                    <StatusBadge
                      label={RDV_TYPE_LABELS[rdv.type]}
                      colorClass="bg-blue-100 text-blue-700"
                    />
                  </div>
                  {rdv.notes && <p className="text-muted-foreground mt-0.5">{rdv.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Calls History */}
        <div className="p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Derniers appels
          </h3>
          {recentCalls.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun appel enregistré</p>
          ) : (
            <div className="space-y-1.5">
              {recentCalls.map((call) => (
                <div key={call.id} className="text-xs p-2 rounded-lg border bg-muted/20">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{CALL_RESULT_LABELS[call.result]}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <StatusBadge
                      label={PROSPECT_STATUS_LABELS[call.new_status]}
                      colorClass={PROSPECT_STATUS_COLORS[call.new_status]}
                    />
                  </div>
                  {call.note && (
                    <p className="text-muted-foreground mt-0.5">{call.note}</p>
                  )}
                  <p className="text-muted-foreground mt-0.5">{formatRelative(call.called_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
