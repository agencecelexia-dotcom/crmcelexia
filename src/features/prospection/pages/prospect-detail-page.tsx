import { useParams, useNavigate } from 'react-router-dom'
import { useProspect, useUpdateProspect } from '../hooks/use-prospects'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/shared/status-badge'
import { PROSPECT_STATUS_LABELS, PROSPECT_STATUS_COLORS } from '@/types/enums'
import { CallLogger } from '../components/call-logger'
import { CallHistory } from '../components/call-history'
import { ReminderForm } from '../components/reminder-form'
import { ReminderList } from '../components/reminder-list'
import { RdvForm } from '@/features/rendez-vous/components/rdv-form'
import { RdvListForProspect } from '@/features/rendez-vous/components/rdv-list-for-prospect'
import { formatDate } from '@/lib/format'
import { ArrowLeft, Phone, Clock, Globe, MapPin, Pencil, Save, X, CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

export function ProspectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isFounder } = useAuth()
  const { data: prospect, isLoading, error } = useProspect(id)
  const updateProspect = useUpdateProspect()
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState<Record<string, string>>({})
  const [callLoggerOpen, setCallLoggerOpen] = useState(false)
  const [reminderFormOpen, setReminderFormOpen] = useState(false)
  const [rdvFormOpen, setRdvFormOpen] = useState(false)
  const [lastCallId, setLastCallId] = useState<string | null>(null)

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

  function handleCallSuccess(callId: string) {
    setLastCallId(callId)
    // Auto-open RDV form after a call that results in rdv_pris
    setTimeout(() => {
      // Re-check prospect status after query invalidation
      if (prospect!.status === 'rdv_pris' || prospect!.status === 'interesse') {
        setRdvFormOpen(true)
      }
    }, 500)
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
          <Button variant="ghost" size="sm" onClick={() => navigate('/prospects')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{prospect.company_name}</h1>
            <p className="text-sm text-muted-foreground">
              {prospect.contact_firstname} {prospect.contact_name}
              {prospect.profession && ` · ${prospect.profession}`}
              {prospect.city && ` · ${prospect.city}`}
            </p>
          </div>
          <StatusBadge
            label={PROSPECT_STATUS_LABELS[prospect.status]}
            colorClass={PROSPECT_STATUS_COLORS[prospect.status]}
          />
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

          {/* Rendez-vous */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Rendez-vous</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setRdvFormOpen(true)}>
                <CalendarDays className="mr-1 h-4 w-4" /> Planifier
              </Button>
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
                <Button className="w-full" size="sm" onClick={() => setCallLoggerOpen(true)}>
                  <Phone className="mr-2 h-4 w-4" />
                  Logger un appel
                </Button>
                <Button variant="outline" className="w-full" size="sm" onClick={() => setRdvFormOpen(true)}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Planifier un RDV
                </Button>
                <Button variant="outline" className="w-full" size="sm" onClick={() => setReminderFormOpen(true)}>
                  <Clock className="mr-2 h-4 w-4" />
                  Planifier un rappel
                </Button>
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
              {prospect.website && (
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
      <RdvForm
        prospect={prospect}
        open={rdvFormOpen}
        onOpenChange={setRdvFormOpen}
        callId={lastCallId}
      />
    </div>
  )
}
