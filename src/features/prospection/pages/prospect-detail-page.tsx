import { useParams, useNavigate } from 'react-router-dom'
import { useProspect, useProspects, useUpdateProspect, useTeamMembers } from '../hooks/use-prospects'
import { useConvertProspect } from '@/features/clients/hooks/use-clients'
import { reassignPendingReminders } from '../services/prospect-service'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollTimePicker } from '@/components/ui/scroll-time-picker'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/status-badge'
import {
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUS_COLORS,
  CALL_RESULT_TO_STATUS,
  LOSS_REASON_LABELS,
  LOSS_REASON_COLORS,
  OPPORTUNITY_PIPELINE_STAGES,
  OPPORTUNITY_STATUS_LABELS,
  contextFromOppStatus,
  type CallResult,
  type ProspectStatus,
  type LossReason,
  type OpportunityStatus,
} from '@/types/enums'
import { useLogCall } from '../hooks/use-calls'
import { CallLogger } from '../components/call-logger'
import { CallHistory } from '../components/call-history'
import { ReminderForm } from '../components/reminder-form'
import { useCreateReminder } from '../hooks/use-reminders'
import { ReminderList } from '../components/reminder-list'
import { RdvForm } from '@/features/rendez-vous/components/rdv-form'
import { RdvListForProspect } from '@/features/rendez-vous/components/rdv-list-for-prospect'
import { LeadScoring } from '@/features/opportunities/components/lead-scoring'
import { useOpportunityForProspect, useUpdateOpportunityStatus } from '@/features/opportunities/hooks/use-opportunities'
import { formatDate } from '@/lib/format'
import {
  ArrowLeft,
  Phone,
  Clock,
  Globe,
  MapPin,
  Pencil,
  Save,
  X,
  CalendarDays,
  AlertTriangle,
  Zap,
  XCircle,
  UserCheck,
  ChevronUp,
  ChevronDown,
  Loader2,
  PhoneForwarded,
  Undo2,
  Send,
  FileText,
  TrendingUp,
  CheckCircle2,
  Megaphone,
} from 'lucide-react'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCalcomLink, buildCalcomUrl } from '@/hooks/use-calcom'
import type { OpportunityType } from '@/types/enums'
import { useUndo } from '@/hooks/use-undo'
import { supabase } from '@/lib/supabase/client'
import { N8N_SITE_DESTROY_WEBHOOK } from '@/lib/constants'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { LeadScore } from '@/types'

export function ProspectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isFounder, session } = useAuth()
  const { data: prospect, isLoading, error } = useProspect(id)
  const updateProspect = useUpdateProspect()
  const convertProspect = useConvertProspect()
  const queryClient = useQueryClient()
  const { data: calcomLink } = useCalcomLink()
  const { data: teamMembers = [] } = useTeamMembers()
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState<Record<string, string>>({})
  const [callLoggerOpen, setCallLoggerOpen] = useState(false)
  const [reminderFormOpen, setReminderFormOpen] = useState(false)
  const [rdvFormOpen, setRdvFormOpen] = useState(false)
  const [rappelerDialogOpen, setRappelerDialogOpen] = useState(false)
  const [rappelerDate, setRappelerDate] = useState('')
  const [rappelerTime, setRappelerTime] = useState('09:00')
  const [rappelerNote, setRappelerNote] = useState('')
  const [lastCallId, setLastCallId] = useState<string | null>(null)
  const [waitingForCalcom, setWaitingForCalcom] = useState(false)
  const [siteEnvoyeDialogOpen, setSiteEnvoyeDialogOpen] = useState(false)
  const [dateEnvoiSite, setDateEnvoiSite] = useState('')
  const [siteUrl, setSiteUrl] = useState('')
  const [undoInfo, setUndoInfo] = useState<{ previousStatus: ProspectStatus; newStatus: ProspectStatus } | null>(null)
  const [undoing, setUndoing] = useState(false)
  const logCallMutation = useLogCall()
  const createReminder = useCreateReminder()
  const { setUndoAction } = useUndo()
  // ── Opportunity liée à ce prospect ──
  const { data: linkedOpportunity } = useOpportunityForProspect(id)
  const updateOppStatus = useUpdateOpportunityStatus()
  const [pendingOppLoss, setPendingOppLoss] = useState<boolean>(false)
  const [oppLossReason, setOppLossReason] = useState<string>('')
  const [oppLossNotes, setOppLossNotes] = useState('')
  const [pendingOppSiteEnvoye, setPendingOppSiteEnvoye] = useState(false)
  const [oppSiteUrl, setOppSiteUrl] = useState('')
  const [oppDateEnvoiSite, setOppDateEnvoiSite] = useState('')
  // ── Booking type choice (site_web vs pub) ──
  const [bookingTypeChoiceOpen, setBookingTypeChoiceOpen] = useState(false)
  // ── Keyboard navigation: Arrow Up/Down to switch prospects ──
  const { data: prospectListData } = useProspects({ page: 1, pageSize: 200, sortBy: 'created_at', sortDesc: true })
  const prospectIds = useMemo(() => (prospectListData?.data ?? []).map((p) => p.id), [prospectListData])
  const currentIndex = useMemo(() => prospectIds.indexOf(id ?? ''), [prospectIds, id])

  // Loss reason dialog
  const [lossDialogOpen, setLossDialogOpen] = useState(false)
  const [selectedLossReason, setSelectedLossReason] = useState<LossReason | ''>('')
  const [lossNotes, setLossNotes] = useState('')
  const [lossRecallDate, setLossRecallDate] = useState('')
  const [lossRecallNote, setLossRecallNote] = useState('')

  useEffect(() => {
    function handleKeyNav(e: KeyboardEvent) {
      // Don't navigate if user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      // Don't navigate if a dialog is open
      if (callLoggerOpen || reminderFormOpen || rdvFormOpen || lossDialogOpen || rappelerDialogOpen || siteEnvoyeDialogOpen || pendingOppSiteEnvoye || isEditing) return

      if (e.key === 'ArrowDown' && currentIndex >= 0 && currentIndex < prospectIds.length - 1) {
        e.preventDefault()
        navigate(`/prospects/${prospectIds[currentIndex + 1]}`)
      } else if (e.key === 'ArrowUp' && currentIndex > 0) {
        e.preventDefault()
        navigate(`/prospects/${prospectIds[currentIndex - 1]}`)
      }
    }
    document.addEventListener('keydown', handleKeyNav)
    return () => document.removeEventListener('keydown', handleKeyNav)
  }, [currentIndex, prospectIds, navigate, callLoggerOpen, reminderFormOpen, rdvFormOpen, lossDialogOpen, rappelerDialogOpen, siteEnvoyeDialogOpen, pendingOppSiteEnvoye, isEditing])

  // Supabase Realtime: listen for new RDVs created for this prospect (by webhook)
  useEffect(() => {
    if (!id) return

    const channel = supabase
      .channel(`rdv-prospect-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rendez_vous',
          filter: `prospect_id=eq.${id}`,
        },
        () => {
          // New RDV created (likely from Cal.com webhook) → refresh data
          queryClient.invalidateQueries({ queryKey: ['rdv', 'prospect', id] })
          queryClient.invalidateQueries({ queryKey: ['prospect', id] })
          queryClient.invalidateQueries({ queryKey: ['rdv'] })
          setWaitingForCalcom(false)
          toast.success('Nouveau RDV ajouté au calendrier !')
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rendez_vous',
          filter: `prospect_id=eq.${id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['rdv', 'prospect', id] })
          queryClient.invalidateQueries({ queryKey: ['rdv'] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, queryClient])

  // Also poll as fallback (Realtime may not be enabled on all Supabase plans)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollingCountRef = useRef(0)

  const startCalcomPolling = useCallback(() => {
    if (pollingRef.current) return
    setWaitingForCalcom(true)
    pollingCountRef.current = 0
    pollingRef.current = setInterval(() => {
      pollingCountRef.current++
      // Refresh RDV data for this prospect
      queryClient.invalidateQueries({ queryKey: ['rdv', 'prospect', id] })
      queryClient.invalidateQueries({ queryKey: ['prospect', id] })
      // Stop after 10 minutes (120 x 5s)
      if (pollingCountRef.current >= 120) {
        if (pollingRef.current) clearInterval(pollingRef.current)
        pollingRef.current = null
        setWaitingForCalcom(false)
      }
    }, 5000)
  }, [id, queryClient])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  // Lead score from custom_fields
  const savedLeadScore = useMemo(() => {
    if (!prospect?.custom_fields?.lead_score) return undefined
    return prospect.custom_fields.lead_score as Partial<LeadScore>
  }, [prospect])

  // Saved loss reason from custom_fields
  const savedLossReason = useMemo(() => {
    if (!prospect?.custom_fields?.loss_reason) return null
    return prospect.custom_fields.loss_reason as { reason: LossReason; notes?: string }
  }, [prospect])

  // Check if prospect has no planned action
  const hasNoPlannedAction = useMemo(() => {
    if (!prospect) return false
    const activeStatuses = ['site_en_attente', 'site_envoye', 'a_rappeler', 'rdv_pris']
    if (!activeStatuses.includes(prospect.status)) return false
    // If no reminder planned and status is active
    if (!prospect.next_reminder_at) return true
    // If reminder is in the past
    const reminderDate = new Date(prospect.next_reminder_at)
    return reminderDate < new Date()
  }, [prospect])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-4">
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  if (error || !prospect) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/prospects')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Retour
        </Button>
        <p className="text-destructive">Prospect introuvable.</p>
      </div>
    )
  }

  function startEditing() {
    setEditData({
      company_name: prospect!.company_name,
      contact_name: prospect!.contact_name ?? '',
      contact_firstname: prospect!.contact_firstname ?? '',
      contact_email: prospect!.contact_email ?? '',
      phone: prospect!.phone,
      phone_secondary: prospect!.phone_secondary ?? '',
      website: prospect!.website ?? '',
      profession: prospect!.profession ?? '',
      city: prospect!.city ?? '',
      address: prospect!.address ?? '',
      notes: prospect!.notes ?? '',
    })
    setIsEditing(true)
  }

  async function saveEdits() {
    try {
      await updateProspect.mutateAsync({
        id: prospect!.id,
        updates: {
          company_name: editData.company_name,
          contact_name: editData.contact_name || null,
          contact_firstname: editData.contact_firstname || null,
          contact_email: editData.contact_email || null,
          phone: editData.phone,
          phone_secondary: editData.phone_secondary || null,
          website: editData.website || null,
          profession: editData.profession || null,
          city: editData.city || null,
          address: editData.address || null,
          notes: editData.notes || null,
        } as Record<string, unknown> as never,
      })
      toast.success('Prospect mis à jour')
      setIsEditing(false)
    } catch {
      toast.error('Erreur lors de la mise à jour')
    }
  }

  async function saveLossReason() {
    if (!selectedLossReason) {
      toast.error('Veuillez sélectionner une raison de perte')
      return
    }
    try {
      const previousStatus = prospect!.status
      const currentFields = prospect!.custom_fields ?? {}
      await updateProspect.mutateAsync({
        id: prospect!.id,
        updates: {
          status: 'perdu',
          custom_fields: {
            ...currentFields,
            loss_reason: {
              reason: selectedLossReason,
              notes: lossNotes.trim() || undefined,
              date: new Date().toISOString(),
            },
          },
        } as Record<string, unknown> as never,
      })
      toast.success('Raison de perte enregistrée')
      // Trigger site destruction (n8n derives repo name even without website field)
      fetch(N8N_SITE_DESTROY_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: prospect }),
      }).catch(() => {/* fire-and-forget */})
      // Register undo
      setUndoInfo({ previousStatus: previousStatus as ProspectStatus, newStatus: 'perdu' as ProspectStatus })
      setUndoAction({
        label: `Annuler: ${prospect!.company_name} → Perdu`,
        undo: async () => {
          await updateProspect.mutateAsync({
            id: prospect!.id,
            updates: { status: previousStatus },
          })
        },
      })
      // Auto-log a call for status change
      if (session?.user) {
        try {
          await logCallMutation.mutateAsync({
            prospect_id: prospect!.id,
            commercial_id: session.user.id,
            result: 'reached_not_interested' as CallResult,
            new_status: 'perdu' as ProspectStatus,
            note: `Perdu: ${LOSS_REASON_LABELS[selectedLossReason as LossReason]}${lossNotes ? ' - ' + lossNotes : ''}`,
          })
        } catch {
          // Non-blocking
        }
      }
      // Creer un rappel optionnel si une date de rappel est definie
      if (lossRecallDate && session?.user) {
        try {
          await createReminder.mutateAsync({
            prospect_id: prospect!.id,
            commercial_id: session.user.id,
            remind_at: new Date(lossRecallDate + 'T09:00:00').toISOString(),
            note: lossRecallNote.trim() || `Relance ${prospect!.company_name} (perdu — peut-être plus tard)`,
            context: 'post_perte',
          })
          toast.success('Rappel créé pour la relance future')
        } catch {
          // Non-blocking
        }
      }
      setLossDialogOpen(false)
      setSelectedLossReason('')
      setLossNotes('')
      setLossRecallDate('')
      setLossRecallNote('')
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    }
  }

  async function saveLeadScore(score: LeadScore) {
    try {
      const currentFields = prospect!.custom_fields ?? {}
      await updateProspect.mutateAsync({
        id: prospect!.id,
        updates: {
          custom_fields: {
            ...currentFields,
            lead_score: { ...score, prospect_id: prospect!.id },
          },
        } as Record<string, unknown> as never,
      })
      toast.success('Score mis à jour')
    } catch {
      toast.error('Erreur lors de la sauvegarde du score')
    }
  }

  const CALCOM_SITE_WEB = 'https://cal.com/agence-celexia-1qyn93/presentation-site-web-agence-celexia?overlayCalendar=true'
  const CALCOM_PUB = 'https://cal.com/agence-celexia-1qyn93/apport-d-affaires?overlayCalendar=true'

  async function openCalcom(bookingType?: OpportunityType) {
    if (!prospect) return
    const link = bookingType === 'pub' ? CALCOM_PUB : (calcomLink || CALCOM_SITE_WEB)
    const bookingUrl = buildCalcomUrl(link, prospect)
    if (bookingUrl) {
      window.open(bookingUrl, '_blank', 'noopener,noreferrer')

      // Immediately update prospect status to rdv_pris
      const statusesToUpdate = ['nouveau', 'messagerie', 'site_en_attente', 'site_envoye', 'a_rappeler', 'negatif']
      if (statusesToUpdate.includes(prospect.status)) {
        try {
          await updateProspect.mutateAsync({
            id: prospect.id,
            updates: { status: 'rdv_pris' } as Record<string, unknown> as never,
          })
          toast.success('Statut mis à jour → RDV pris')
        } catch {
          // Non-blocking: webhook will also update status
        }
      }

      toast.info('Le RDV apparaîtra automatiquement dans le calendrier')
      startCalcomPolling()
    }
  }

  function handleCallSuccess(callId: string, result: CallResult) {
    setLastCallId(callId)

    const previousStatus = prospect!.status
    const newStatus = CALL_RESULT_TO_STATUS[result]

    // Show persistent undo banner + global sidebar undo if status changed
    if (newStatus && newStatus !== previousStatus) {
      setUndoInfo({ previousStatus, newStatus })
      setUndoAction({
        label: `Annuler: ${prospect!.company_name} → ${PROSPECT_STATUS_LABELS[newStatus]}`,
        undo: async () => {
          await updateProspect.mutateAsync({
            id: prospect!.id,
            updates: { status: previousStatus },
          })
        },
      })
      toast.success(`Statut : ${PROSPECT_STATUS_LABELS[previousStatus]} → ${PROSPECT_STATUS_LABELS[newStatus]}`)
    }

    // Open loss reason dialog for negative results
    if (result === 'reached_not_interested') {
      setLossDialogOpen(true)
    }

    // "Intéressé" or "À rappeler" → open rappeler dialog to set date + note
    if (result === 'reached_interested' || result === 'reached_callback') {
      setRappelerDialogOpen(true)
    }

    // "RDV pris" → show booking type choice (site_web vs pub)
    if (result === 'reached_rdv') {
      setBookingTypeChoiceOpen(true)
    }
  }

  const field = (key: string, label: string) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {isEditing ? (
        <Input
          value={editData[key] ?? ''}
          onChange={(e) => setEditData((d) => ({ ...d, [key]: e.target.value }))}
          className="h-8"
        />
      ) : (
        <p className="text-sm">{(prospect as unknown as Record<string, unknown>)[key] as string || '—'}</p>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => navigate('/prospects')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {prospectIds.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={currentIndex <= 0}
                  onClick={() => currentIndex > 0 && navigate(`/prospects/${prospectIds[currentIndex - 1]}`)}
                  title="Prospect précédent (↑)"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {currentIndex + 1}/{prospectIds.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={currentIndex >= prospectIds.length - 1}
                  onClick={() => currentIndex < prospectIds.length - 1 && navigate(`/prospects/${prospectIds[currentIndex + 1]}`)}
                  title="Prospect suivant (↓)"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{prospect.company_name}</h1>
            <p className="text-sm text-muted-foreground">
              {[prospect.contact_firstname, prospect.contact_name].filter(Boolean).join(' ')}
              {prospect.profession && ` · ${prospect.profession}`}
              {prospect.city && ` · ${prospect.city}`}
            </p>
          </div>
          <StatusBadge
            label={PROSPECT_STATUS_LABELS[prospect.status]}
            colorClass={PROSPECT_STATUS_COLORS[prospect.status]}
          />
          {savedLeadScore?.total_score != null && (
            <Badge className={`text-xs ${
              savedLeadScore.total_score >= 80 ? 'bg-green-100 text-green-800' :
              savedLeadScore.total_score >= 60 ? 'bg-blue-100 text-blue-800' :
              savedLeadScore.total_score >= 40 ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              <Zap className="h-3 w-3 mr-1" />
              Score: {savedLeadScore.total_score}/100
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                <X className="mr-1 h-4 w-4" /> Annuler
              </Button>
              <Button size="sm" onClick={saveEdits} disabled={updateProspect.isPending}>
                <Save className="mr-1 h-4 w-4" /> Enregistrer
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="mr-1 h-4 w-4" /> Modifier
            </Button>
          )}
        </div>
      </div>

      {/* Undo banner — persistent button after status change */}
      {undoInfo && (
        <div className="flex items-center gap-3 rounded-lg border border-violet-300 bg-violet-50 p-3 animate-in slide-in-from-top-2">
          <Undo2 className="h-5 w-5 text-violet-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-violet-800">
              Statut modifié : {PROSPECT_STATUS_LABELS[undoInfo.previousStatus]} → {PROSPECT_STATUS_LABELS[undoInfo.newStatus]}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="border-violet-300 text-violet-700 hover:bg-violet-100"
              disabled={undoing}
              onClick={async () => {
                setUndoing(true)
                try {
                  await updateProspect.mutateAsync({
                    id: prospect!.id,
                    updates: { status: undoInfo.previousStatus } as Record<string, unknown> as never,
                  })
                  toast.success(`Statut rétabli → ${PROSPECT_STATUS_LABELS[undoInfo.previousStatus]}`)
                  setUndoInfo(null)
                } catch {
                  toast.error('Erreur lors de l\'annulation')
                } finally {
                  setUndoing(false)
                }
              }}
            >
              {undoing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Undo2 className="mr-1 h-4 w-4" />}
              Annuler
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-violet-600"
              onClick={() => setUndoInfo(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Alert: No planned action */}
      {hasNoPlannedAction && (
        <div className="flex items-center gap-3 rounded-lg border border-orange-300 bg-orange-50 p-3">
          <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-orange-800">Aucune action planifiée</p>
            <p className="text-xs text-orange-600">Ce prospect actif n'a pas de rappel ou d'action à venir. Planifiez un rappel ou un RDV.</p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => setReminderFormOpen(true)}>
            <Clock className="h-3.5 w-3.5 mr-1" /> Planifier
          </Button>
        </div>
      )}

      {/* Loss reason display */}
      {prospect.status === 'perdu' && savedLossReason && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50/50 p-3">
          <XCircle className="h-5 w-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-red-800">Raison de perte :</p>
              <Badge className={LOSS_REASON_COLORS[savedLossReason.reason]}>
                {LOSS_REASON_LABELS[savedLossReason.reason]}
              </Badge>
            </div>
            {savedLossReason.notes && (
              <p className="text-xs text-red-600 mt-1">{savedLossReason.notes}</p>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={() => { setSelectedLossReason(savedLossReason.reason); setLossNotes(savedLossReason.notes ?? ''); setLossDialogOpen(true) }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Mark as lost button if perdu but no reason */}
      {prospect.status === 'perdu' && !savedLossReason && (
        <div className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 p-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">Raison de perte manquante</p>
            <p className="text-xs text-red-600">Ce prospect est marqué comme perdu sans raison. Veuillez documenter la raison.</p>
          </div>
          <Button size="sm" variant="destructive" onClick={() => setLossDialogOpen(true)}>
            Documenter
          </Button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left: Prospect info */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informations</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {field('company_name', 'Entreprise')}
              {field('phone', 'Téléphone')}
              {field('contact_firstname', 'Prénom')}
              {field('contact_name', 'Nom')}
              {field('contact_email', 'Email')}
              {field('phone_secondary', 'Tél. secondaire')}
              {field('profession', 'Métier')}
              {field('city', 'Ville')}
              {field('address', 'Adresse')}
              {field('website', 'Site web')}
              {(prospect.siret || prospect.siren) && !isEditing && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">SIRET</Label>
                    <p className="text-sm font-mono">{prospect.siret || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">SIREN</Label>
                    <p className="text-sm font-mono">{prospect.siren || '—'}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {isEditing && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={editData.notes ?? ''}
                  onChange={(e) => setEditData((d) => ({ ...d, notes: e.target.value }))}
                  rows={4}
                />
              </CardContent>
            </Card>
          )}

          {!isEditing && prospect.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{prospect.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Lead Scoring */}
          <LeadScoring
            initialScore={savedLeadScore}
            onChange={saveLeadScore}
          />

          {/* Rendez-vous */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Rendez-vous</CardTitle>
                {waitingForCalcom && (
                  <span className="flex items-center gap-1 text-xs text-blue-600 animate-pulse">
                    <CalendarDays className="h-3 w-3" />
                    Sync en cours...
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => openCalcom('site_web')}>
                  <Globe className="mr-1 h-4 w-4" /> RDV Site
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openCalcom('pub')}>
                  <Megaphone className="mr-1 h-4 w-4" /> RDV Pub
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <RdvListForProspect prospectId={prospect.id} />
            </CardContent>
          </Card>

          {/* Call history */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historique des appels</CardTitle>
            </CardHeader>
            <CardContent>
              <CallHistory prospectId={prospect.id} />
            </CardContent>
          </Card>

          {/* Reminders */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Rappels</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setReminderFormOpen(true)}>
                <Clock className="mr-1 h-4 w-4" /> Ajouter
              </Button>
            </CardHeader>
            <CardContent>
              <ReminderList prospectId={prospect.id} />
            </CardContent>
          </Card>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Statut</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatusBadge
                label={PROSPECT_STATUS_LABELS[prospect.status]}
                colorClass={PROSPECT_STATUS_COLORS[prospect.status]}
                className="text-base py-1 px-3"
              />
              <Separator />
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Actions rapides</p>
                {prospect.status !== 'converti_client' && (
                  <>
                    <Button className="w-full" size="sm" onClick={() => setCallLoggerOpen(true)}>
                      <Phone className="mr-2 h-4 w-4" />
                      Logger un appel
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full border-purple-300 text-purple-700 hover:bg-purple-50"
                      size="sm"
                      onClick={() => setRappelerDialogOpen(true)}
                    >
                      <PhoneForwarded className="mr-2 h-4 w-4" />
                      {linkedOpportunity && ['site_envoye', 'rdv', 'en_attente_retour'].includes(linkedOpportunity.status)
                        ? 'Planifier un suivi'
                        : 'À rappeler'}
                    </Button>
                    {['nouveau', 'messagerie', 'appele_sans_reponse', 'a_rappeler'].includes(prospect.status) && (
                      <Button
                        variant="outline"
                        className="w-full border-cyan-300 text-cyan-700 hover:bg-cyan-50"
                        size="sm"
                        onClick={async () => {
                          try {
                            const previousStatus = prospect.status
                            await updateProspect.mutateAsync({
                              id: prospect.id,
                              updates: { status: 'site_en_attente' } as Record<string, unknown> as never,
                            })
                            toast.success('Statut → Site en attente')
                            setUndoInfo({ previousStatus: previousStatus as ProspectStatus, newStatus: 'site_en_attente' as ProspectStatus })
                            setUndoAction({
                              label: `Annuler: ${prospect.company_name} → Site en attente`,
                              undo: async () => {
                                await updateProspect.mutateAsync({
                                  id: prospect.id,
                                  updates: { status: previousStatus },
                                })
                              },
                            })
                          } catch {
                            toast.error('Erreur lors de la mise à jour')
                          }
                        }}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Site en attente
                      </Button>
                    )}
                    {prospect.status === 'site_en_attente' && (
                      <>
                        <Button
                          variant="outline"
                          className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                          size="sm"
                          onClick={() => {
                            setDateEnvoiSite(new Date().toISOString().split('T')[0])
                            setSiteUrl(prospect.website ?? '')
                            setSiteEnvoyeDialogOpen(true)
                          }}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Site envoyé
                        </Button>
                        <Button
                          variant="ghost"
                          className="w-full text-muted-foreground hover:text-foreground"
                          size="sm"
                          onClick={async () => {
                            try {
                              await updateProspect.mutateAsync({
                                id: prospect.id,
                                updates: { status: 'nouveau' } as Record<string, unknown> as never,
                              })
                              toast.success('Statut → Nouveau')
                            } catch {
                              toast.error('Erreur lors de la mise à jour')
                            }
                          }}
                        >
                          <Undo2 className="mr-2 h-4 w-4" />
                          Remettre en nouveau
                        </Button>
                      </>
                    )}
                    <Button variant="outline" className="w-full" size="sm" onClick={() => openCalcom('site_web')}>
                      <Globe className="mr-2 h-4 w-4" />
                      RDV Site Web
                    </Button>
                    <Button variant="outline" className="w-full" size="sm" onClick={() => openCalcom('pub')}>
                      <Megaphone className="mr-2 h-4 w-4" />
                      RDV Pub (LSA)
                    </Button>
                    <Button variant="outline" className="w-full" size="sm" onClick={() => setReminderFormOpen(true)}>
                      <Clock className="mr-2 h-4 w-4" />
                      Planifier un rappel
                    </Button>
                  </>
                )}
                {prospect.status === 'rdv_pris' || prospect.status === 'site_envoye' || prospect.status === 'converti_client' ? (
                  <Button
                    variant="default"
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    size="sm"
                    disabled={convertProspect.isPending}
                    onClick={async () => {
                      try {
                        const clientId = await convertProspect.mutateAsync(prospect.id)
                        toast.success('Prospect converti en client !')
                        navigate(`/clients/${clientId}`)
                      } catch {
                        toast.error('Erreur lors de la conversion')
                      }
                    }}
                  >
                    <UserCheck className="mr-2 h-4 w-4" />
                    {convertProspect.isPending ? 'Conversion...' : 'Convertir en client'}
                  </Button>
                ) : null}
                {prospect.status !== 'perdu' && prospect.status !== 'converti_client' && (
                  <Button
                    variant="ghost"
                    className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                    size="sm"
                    onClick={() => setLossDialogOpen(true)}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Marquer comme perdu
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pipeline de vente — affiché uniquement si une opportunité est liée */}
          {linkedOpportunity && (
            <Card className="border-blue-200 bg-blue-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  Pipeline de vente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Étapes actives */}
                <div className="space-y-1">
                  {OPPORTUNITY_PIPELINE_STAGES.map((stage) => {
                    const isCurrent = linkedOpportunity.status === stage
                    return (
                      <button
                        key={stage}
                        disabled={updateOppStatus.isPending || updateProspect.isPending}
                        onClick={() => {
                          if (isCurrent) return
                          if (stage === 'site_envoye') {
                            setOppSiteUrl(prospect.website ?? '')
                            setOppDateEnvoiSite(new Date().toISOString().split('T')[0])
                            setPendingOppSiteEnvoye(true)
                            return
                          }
                          updateOppStatus.mutate({ id: linkedOpportunity.id, status: stage })
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          isCurrent
                            ? 'bg-blue-600 text-white border-blue-600 cursor-default'
                            : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-700'
                        } disabled:opacity-50`}
                      >
                        {isCurrent && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                        <span>{OPPORTUNITY_STATUS_LABELS[stage]}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Séparateur + statut terminal */}
                <Separator />
                <div className="grid grid-cols-1 gap-1">
                  {(() => {
                    const isCurrent = linkedOpportunity.status === 'perdu'
                    return (
                      <button
                        disabled={updateOppStatus.isPending}
                        onClick={() => {
                          if (isCurrent) return
                          setPendingOppLoss(true)
                        }}
                        className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                          isCurrent
                            ? 'bg-red-600 text-white border-red-600 cursor-default'
                            : 'bg-white border-red-200 text-red-600 hover:bg-red-50'
                        } disabled:opacity-50`}
                      >
                        {isCurrent && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                        {OPPORTUNITY_STATUS_LABELS['perdu']}
                      </button>
                    )
                  })()}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dialog raison de perte opportunité depuis fiche prospect */}
          <Dialog open={pendingOppLoss} onOpenChange={(open) => { if (!open) { setPendingOppLoss(false); setOppLossReason(''); setOppLossNotes('') } }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Raison de la perte</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Raison *</Label>
                  <Select value={oppLossReason} onValueChange={setOppLossReason}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner une raison..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(LOSS_REASON_LABELS) as [LossReason, string][]).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={oppLossNotes}
                    onChange={(e) => setOppLossNotes(e.target.value)}
                    placeholder="Détails supplémentaires..."
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => { setPendingOppLoss(false); setOppLossReason(''); setOppLossNotes('') }}>
                  Annuler
                </Button>
                <Button
                  variant="destructive"
                  disabled={!oppLossReason || updateOppStatus.isPending}
                  onClick={() => {
                    if (!linkedOpportunity || !oppLossReason) return
                    updateOppStatus.mutate({
                      id: linkedOpportunity.id,
                      status: 'perdu',
                      extra: { loss_reason: oppLossReason, loss_notes: oppLossNotes || undefined },
                    })
                    setPendingOppLoss(false)
                    setOppLossReason('')
                    setOppLossNotes('')
                  }}
                >
                  Confirmer la perte
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Détails</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Appels</span>
                <span className="font-medium">{prospect.call_count}</span>
              </div>
              {prospect.last_called_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dernier appel</span>
                  <span className="font-medium">{formatDate(prospect.last_called_at)}</span>
                </div>
              )}
              {prospect.next_reminder_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prochain rappel</span>
                  <span className={`font-medium ${new Date(prospect.next_reminder_at) < new Date() ? 'text-red-600' : 'text-blue-600'}`}>
                    {formatDate(prospect.next_reminder_at)}
                  </span>
                </div>
              )}
              {prospect.date_envoi_site && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Site envoyé le</span>
                  <span className="font-medium text-blue-600">{formatDate(prospect.date_envoi_site)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span className="font-medium">{prospect.source === 'csv_import' ? 'CSV' : prospect.source}</span>
              </div>
              {prospect.commercial && (
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Commercial</span>
                    <span className="font-medium">{prospect.commercial.full_name}</span>
                  </div>
                  {isFounder && (
                    <Select
                      value={prospect.commercial_id ?? ''}
                      onValueChange={async (v) => {
                        try {
                          await updateProspect.mutateAsync({
                            id: prospect.id,
                            updates: { commercial_id: v } as Record<string, unknown> as never,
                          })
                          await reassignPendingReminders(prospect.id, v)
                          toast.success('Commercial modifié')
                        } catch {
                          toast.error('Erreur lors du changement')
                        }
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {teamMembers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.full_name} ({m.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              {!prospect.commercial && isFounder && (
                <div className="space-y-1">
                  <span className="text-muted-foreground text-sm">Commercial</span>
                  <Select
                    value=""
                    onValueChange={async (v) => {
                      try {
                        await updateProspect.mutateAsync({
                          id: prospect.id,
                          updates: { commercial_id: v } as Record<string, unknown> as never,
                        })
                        await reassignPendingReminders(prospect.id, v)
                        toast.success('Commercial assigné')
                      } catch {
                        toast.error('Erreur lors de l\'assignation')
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Assigner un commercial..." />
                    </SelectTrigger>
                    <SelectContent>
                      {teamMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.full_name} ({m.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Créé le</span>
                <span className="font-medium">{formatDate(prospect.created_at)}</span>
              </div>
              {prospect.google_maps_url && (
                <a
                  href={prospect.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <MapPin className="h-4 w-4" />
                  Voir sur Google Maps
                </a>
              )}
              {prospect.website && !prospect.website.toLowerCase().startsWith('javascript:') && (
                <a
                  href={prospect.website.startsWith('http') ? prospect.website : `https://${prospect.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <Globe className="h-4 w-4" />
                  Site web
                </a>
              )}
              <Separator />
              {prospect.client_id && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-emerald-600"
                  onClick={() => navigate(`/clients/${prospect.client_id}`)}
                >
                  <UserCheck className="h-4 w-4 mr-2" />
                  Voir la fiche client
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-primary"
                onClick={() => navigate('/opportunities')}
              >
                <Zap className="h-4 w-4 mr-2" />
                Voir les opportunités
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      <CallLogger
        prospect={prospect}
        open={callLoggerOpen}
        onOpenChange={setCallLoggerOpen}
        onSuccess={handleCallSuccess}
      />
      <ReminderForm
        prospect={prospect}
        open={reminderFormOpen}
        onOpenChange={setReminderFormOpen}
      />
      {/* Manual RDV form — only used when Cal.com is NOT configured */}
      {!calcomLink && (
        <RdvForm
          prospect={prospect}
          open={rdvFormOpen}
          onOpenChange={setRdvFormOpen}
          callId={lastCallId}
          defaultType={lastCallId ? 'visio' : undefined}
        />
      )}

      {/* À rappeler Dialog */}
      <Dialog open={rappelerDialogOpen} onOpenChange={(o) => { if (!o) { setRappelerDate(''); setRappelerTime('09:00'); setRappelerNote('') }; setRappelerDialogOpen(o) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneForwarded className="h-5 w-5" />
              {linkedOpportunity && ['site_envoye', 'rdv', 'en_attente_retour'].includes(linkedOpportunity.status)
                ? 'Planifier un suivi'
                : 'À rappeler'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted p-3">
              <p className="font-medium">{prospect.company_name}</p>
              {linkedOpportunity && ['site_envoye', 'rdv', 'en_attente_retour'].includes(linkedOpportunity.status) && (
                <p className="text-xs text-muted-foreground mt-1">
                  Pipeline : {OPPORTUNITY_STATUS_LABELS[linkedOpportunity.status as OpportunityStatus] ?? linkedOpportunity.status} — le statut sera conservé
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Date du rappel *</Label>
                <Input
                  type="date"
                  value={rappelerDate}
                  onChange={(e) => setRappelerDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="space-y-2">
                <Label>Heure *</Label>
                <ScrollTimePicker
                  value={rappelerTime}
                  onChange={setRappelerTime}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Note *</Label>
              <Textarea
                value={rappelerNote}
                onChange={(e) => setRappelerNote(e.target.value)}
                placeholder="Pourquoi rappeler ce prospect..."
                rows={3}
              />
            </div>
            {rappelerDate && (
              <p className="text-sm text-muted-foreground">
                Rappel le {new Date(`${rappelerDate}T${rappelerTime}`).toLocaleDateString('fr-FR', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                })} à {rappelerTime}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRappelerDialogOpen(false)}>Annuler</Button>
            <Button
              disabled={!rappelerDate || !rappelerNote.trim() || updateProspect.isPending || createReminder.isPending}
              onClick={async () => {
                if (!rappelerDate || !rappelerNote.trim()) {
                  toast.error('La date et la note sont obligatoires')
                  return
                }
                try {
                  // Si une opportunite est en phase avancee (post-site, post-rdv),
                  // on NE change PAS le statut prospect — il est deja significatif.
                  // On cree juste un rappel avec le contexte adequat.
                  const pipelineStages = ['site_envoye', 'rdv', 'en_attente_retour']
                  const hasActivePipeline = linkedOpportunity && pipelineStages.includes(linkedOpportunity.status)
                  const reminderContext = hasActivePipeline
                    ? contextFromOppStatus(linkedOpportunity!.status)
                    : 'cold_call'

                  if (hasActivePipeline) {
                    // Pas de changement de statut prospect — seulement un rappel
                    if (session?.user) {
                      await createReminder.mutateAsync({
                        prospect_id: prospect.id,
                        commercial_id: session.user.id,
                        remind_at: new Date(`${rappelerDate}T${rappelerTime}:00`).toISOString(),
                        note: rappelerNote.trim(),
                        context: reminderContext,
                      })
                    }
                    toast.success('Rappel planifié (statut conservé)')
                  } else {
                    // Flux normal cold call : log appel + change statut + rappel
                    const previousStatus = prospect.status
                    if (session?.user) {
                      await logCallMutation.mutateAsync({
                        prospect_id: prospect.id,
                        commercial_id: session.user.id,
                        result: 'reached_callback' as CallResult,
                        new_status: 'a_rappeler' as ProspectStatus,
                        note: rappelerNote.trim(),
                      })
                    }
                    if (session?.user) {
                      await createReminder.mutateAsync({
                        prospect_id: prospect.id,
                        commercial_id: session.user.id,
                        remind_at: new Date(`${rappelerDate}T${rappelerTime}:00`).toISOString(),
                        note: rappelerNote.trim(),
                        context: reminderContext,
                      })
                    }
                    setUndoInfo({ previousStatus: previousStatus as ProspectStatus, newStatus: 'a_rappeler' as ProspectStatus })
                    setUndoAction({
                      label: `Annuler: ${prospect.company_name} → À rappeler`,
                      undo: async () => {
                        await updateProspect.mutateAsync({
                          id: prospect.id,
                          updates: { status: previousStatus },
                        })
                      },
                    })
                    toast.success('Statut → À rappeler, rappel planifié')
                  }
                  setRappelerDialogOpen(false)
                  setRappelerDate('')
                  setRappelerTime('09:00')
                  setRappelerNote('')
                } catch {
                  toast.error('Erreur lors de la mise à jour')
                }
              }}
            >
              {(updateProspect.isPending || createReminder.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loss Reason Dialog */}
      <Dialog open={lossDialogOpen} onOpenChange={setLossDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Raison de la perte</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Pourquoi ce prospect est-il perdu ? Cette information est obligatoire pour améliorer votre taux de conversion.
            </p>
            <div className="space-y-2">
              <Label>Raison *</Label>
              <Select value={selectedLossReason} onValueChange={(v) => setSelectedLossReason(v as LossReason)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une raison..." />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(LOSS_REASON_LABELS) as [LossReason, string][]).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes complémentaires</Label>
              <Textarea
                value={lossNotes}
                onChange={(e) => setLossNotes(e.target.value)}
                placeholder="Détails supplémentaires..."
                rows={2}
              />
            </div>
            {/* Rappel optionnel — "non maintenant, peut-être plus tard" */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <p className="text-sm font-medium text-amber-800">Rappel futur (optionnel)</p>
              </div>
              <p className="text-xs text-amber-700">
                Il dit non maintenant mais peut-être plus tard ? Planifie une relance.
              </p>
              <div className="space-y-2">
                <Label className="text-xs">Date de rappel</Label>
                <Input
                  type="date"
                  value={lossRecallDate}
                  onChange={(e) => setLossRecallDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="bg-white"
                />
              </div>
              {lossRecallDate && (
                <div className="space-y-2">
                  <Label className="text-xs">Note pour le rappel</Label>
                  <Input
                    type="text"
                    value={lossRecallNote}
                    onChange={(e) => setLossRecallNote(e.target.value)}
                    placeholder="Ex: Rappeler en mars, budget prévu..."
                    className="bg-white"
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setLossDialogOpen(false); setLossRecallDate(''); setLossRecallNote('') }}>Annuler</Button>
            <Button
              onClick={saveLossReason}
              disabled={!selectedLossReason || updateProspect.isPending}
              variant="destructive"
            >
              Enregistrer{lossRecallDate ? ' + Rappel' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Site envoyé Dialog — requires date + URL */}
      <Dialog open={siteEnvoyeDialogOpen} onOpenChange={(o) => { if (!o) { setDateEnvoiSite(''); setSiteUrl('') }; setSiteEnvoyeDialogOpen(o) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Site envoyé
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted p-3">
              <p className="font-medium">{prospect.company_name}</p>
            </div>
            <div className="space-y-2">
              <Label>URL du site *</Label>
              <Input
                type="text"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://exemple.vercel.app"
              />
            </div>
            <div className="space-y-2">
              <Label>Date d'envoi du site *</Label>
              <Input
                type="date"
                value={dateEnvoiSite}
                onChange={(e) => setDateEnvoiSite(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSiteEnvoyeDialogOpen(false)}>Annuler</Button>
            <Button
              type="button"
              disabled={!dateEnvoiSite || !siteUrl.trim() || updateProspect.isPending}
              onClick={async () => {
                if (!dateEnvoiSite || !siteUrl.trim()) {
                  toast.error('L\'URL et la date d\'envoi sont obligatoires')
                  return
                }
                try {
                  const previousStatus = prospect.status
                  const previousWebsite = prospect.website
                  await updateProspect.mutateAsync({
                    id: prospect.id,
                    updates: {
                      status: 'site_envoye',
                      date_envoi_site: dateEnvoiSite,
                      website: siteUrl.trim(),
                    } as Record<string, unknown> as never,
                  })
                  toast.success('Statut → Site envoyé')
                  setUndoInfo({ previousStatus: previousStatus as ProspectStatus, newStatus: 'site_envoye' as ProspectStatus })
                  setUndoAction({
                    label: `Annuler: ${prospect.company_name} → Site envoyé`,
                    undo: async () => {
                      await updateProspect.mutateAsync({
                        id: prospect.id,
                        updates: { status: previousStatus, date_envoi_site: null, website: previousWebsite ?? null },
                      })
                    },
                  })
                  setSiteEnvoyeDialogOpen(false)
                  setDateEnvoiSite('')
                  setSiteUrl('')
                } catch (err: unknown) {
                  console.error('Prospect update error:', err)
                  // toast handled by useUpdateProspect onError
                }
              }}
            >
              {updateProspect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Site envoyé Dialog — depuis pipeline de vente (met à jour opp + prospect) */}
      <Dialog open={pendingOppSiteEnvoye} onOpenChange={(o) => { if (!o) { setOppSiteUrl(''); setOppDateEnvoiSite('') }; setPendingOppSiteEnvoye(o) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Site envoyé
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>URL du site *</Label>
              <Input
                type="text"
                value={oppSiteUrl}
                onChange={(e) => setOppSiteUrl(e.target.value)}
                placeholder="https://exemple.vercel.app"
              />
            </div>
            <div className="space-y-2">
              <Label>Date d'envoi *</Label>
              <Input
                type="date"
                value={oppDateEnvoiSite}
                onChange={(e) => setOppDateEnvoiSite(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPendingOppSiteEnvoye(false)}>Annuler</Button>
            <Button
              type="button"
              disabled={!oppDateEnvoiSite || !oppSiteUrl.trim() || updateOppStatus.isPending || updateProspect.isPending}
              onClick={async () => {
                if (!oppDateEnvoiSite || !oppSiteUrl.trim() || !linkedOpportunity) return
                try {
                  updateOppStatus.mutate({ id: linkedOpportunity.id, status: 'site_envoye' })
                  await updateProspect.mutateAsync({
                    id: prospect.id,
                    updates: {
                      website: oppSiteUrl.trim(),
                      date_envoi_site: oppDateEnvoiSite,
                    } as Record<string, unknown> as never,
                  })
                  toast.success('Statut → Site envoyé')
                  setPendingOppSiteEnvoye(false)
                  setOppSiteUrl('')
                  setOppDateEnvoiSite('')
                } catch (err: unknown) {
                  console.error('Pipeline site envoyé error:', err)
                  // toast handled by useUpdateProspect onError
                }
              }}
            >
              {(updateOppStatus.isPending || updateProspect.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking type choice dialog (Site Web vs Pub) */}
      <Dialog open={bookingTypeChoiceOpen} onOpenChange={setBookingTypeChoiceOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Type de RDV</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Pour quel service souhaitez-vous booker ce RDV ?</p>
          <div className="grid grid-cols-2 gap-3 py-4">
            <Button
              variant="outline"
              className="h-24 flex-col gap-2 border-2 hover:border-blue-400 hover:bg-blue-50"
              onClick={() => {
                setBookingTypeChoiceOpen(false)
                openCalcom('site_web')
              }}
            >
              <Globe className="h-6 w-6 text-blue-600" />
              <span className="text-sm font-medium">Site Web</span>
            </Button>
            <Button
              variant="outline"
              className="h-24 flex-col gap-2 border-2 hover:border-amber-400 hover:bg-amber-50"
              onClick={() => {
                setBookingTypeChoiceOpen(false)
                openCalcom('pub')
              }}
            >
              <Megaphone className="h-6 w-6 text-amber-600" />
              <span className="text-sm font-medium">Pub (LSA)</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
