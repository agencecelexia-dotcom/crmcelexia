import { useParams, useNavigate } from 'react-router-dom'
import { useProspect, useProspects, useUpdateProspect } from '../hooks/use-prospects'
import { useConvertProspect } from '@/features/clients/hooks/use-clients'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/status-badge'
import {
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUS_COLORS,
  LOSS_REASON_LABELS,
  LOSS_REASON_COLORS,
  type CallResult,
  type ProspectStatus,
  type LossReason,
} from '@/types/enums'
import { useLogCall } from '../hooks/use-calls'
import { CallLogger } from '../components/call-logger'
import { CallHistory } from '../components/call-history'
import { ReminderForm } from '../components/reminder-form'
import { ReminderList } from '../components/reminder-list'
import { RdvForm } from '@/features/rendez-vous/components/rdv-form'
import { RdvListForProspect } from '@/features/rendez-vous/components/rdv-list-for-prospect'
import { LeadScoring } from '@/features/opportunities/components/lead-scoring'
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
} from 'lucide-react'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCalcomLink, buildCalcomUrl } from '@/hooks/use-calcom'
import { supabase } from '@/lib/supabase/client'
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
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState<Record<string, string>>({})
  const [callLoggerOpen, setCallLoggerOpen] = useState(false)
  const [reminderFormOpen, setReminderFormOpen] = useState(false)
  const [rdvFormOpen, setRdvFormOpen] = useState(false)
  const [lastCallId, setLastCallId] = useState<string | null>(null)
  const [waitingForCalcom, setWaitingForCalcom] = useState(false)
  const logCallMutation = useLogCall()

  // ── Keyboard navigation: Arrow Up/Down to switch prospects ──
  const { data: prospectListData } = useProspects({ page: 1, pageSize: 200, sortBy: 'created_at', sortDesc: true })
  const prospectIds = useMemo(() => (prospectListData?.data ?? []).map((p) => p.id), [prospectListData])
  const currentIndex = useMemo(() => prospectIds.indexOf(id ?? ''), [prospectIds, id])

  // Loss reason dialog
  const [lossDialogOpen, setLossDialogOpen] = useState(false)
  const [selectedLossReason, setSelectedLossReason] = useState<LossReason | ''>('')
  const [lossNotes, setLossNotes] = useState('')

  useEffect(() => {
    function handleKeyNav(e: KeyboardEvent) {
      // Don't navigate if user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      // Don't navigate if a dialog is open
      if (callLoggerOpen || reminderFormOpen || rdvFormOpen || lossDialogOpen || isEditing) return

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
  }, [currentIndex, prospectIds, navigate, callLoggerOpen, reminderFormOpen, rdvFormOpen, lossDialogOpen, isEditing])

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
          toast.success('Nouveau RDV détecté depuis Cal.com !')
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
    const activeStatuses = ['interesse', 'a_rappeler', 'rdv_pris']
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
      setLossDialogOpen(false)
      setSelectedLossReason('')
      setLossNotes('')
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

  async function openCalcom() {
    if (!calcomLink || !prospect) return
    const bookingUrl = buildCalcomUrl(calcomLink, prospect)
    if (bookingUrl) {
      window.open(bookingUrl, '_blank', 'noopener,noreferrer')

      // Immediately update prospect status to rdv_pris
      const statusesToUpdate = ['nouveau', 'appele_sans_reponse', 'messagerie', 'interesse', 'a_rappeler', 'negatif']
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

      toast.info('Réservez un créneau sur Cal.com — le RDV apparaîtra ici automatiquement')
      startCalcomPolling()
    }
  }

  function handleCallSuccess(callId: string, result: CallResult) {
    setLastCallId(callId)

    // Open loss reason dialog for negative results
    if (result === 'reached_not_interested') {
      setLossDialogOpen(true)
    }

    // "RDV pris" → Cal.com if configured, otherwise manual RDV form
    if (result === 'reached_rdv') {
      if (calcomLink) {
        openCalcom()
      } else {
        setRdvFormOpen(true)
      }
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
                    En attente Cal.com...
                  </span>
                )}
              </div>
              {calcomLink ? (
                <Button variant="ghost" size="sm" onClick={openCalcom}>
                  <CalendarDays className="mr-1 h-4 w-4" /> Réserver (Cal.com)
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setRdvFormOpen(true)}>
                  <CalendarDays className="mr-1 h-4 w-4" /> Planifier
                </Button>
              )}
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
                    {calcomLink ? (
                      <Button variant="outline" className="w-full" size="sm" onClick={openCalcom}>
                        <CalendarDays className="mr-2 h-4 w-4" />
                        Réserver un RDV (Cal.com)
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full" size="sm" onClick={() => setRdvFormOpen(true)}>
                        <CalendarDays className="mr-2 h-4 w-4" />
                        Planifier un RDV
                      </Button>
                    )}
                    <Button variant="outline" className="w-full" size="sm" onClick={() => setReminderFormOpen(true)}>
                      <Clock className="mr-2 h-4 w-4" />
                      Planifier un rappel
                    </Button>
                  </>
                )}
                {prospect.status === 'rdv_pris' || prospect.status === 'interesse' ? (
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
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span className="font-medium">{prospect.source === 'csv_import' ? 'CSV' : prospect.source}</span>
              </div>
              {isFounder && prospect.commercial && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Commercial</span>
                  <span className="font-medium">{prospect.commercial.full_name}</span>
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
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLossDialogOpen(false)}>Annuler</Button>
            <Button
              onClick={saveLossReason}
              disabled={!selectedLossReason || updateProspect.isPending}
              variant="destructive"
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
