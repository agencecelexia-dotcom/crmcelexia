import { useParams, useNavigate } from 'react-router-dom'
import { useState, useMemo, useCallback, useRef } from 'react'
import { useAuth } from '@/features/auth/hooks/use-auth'
import {
  useClient,
  useUpdateClient,
  useProjectForClient,
  useCreateProject,
  useUpdateProject,
  useProjectNotes,
  useCreateProjectNote,
  useDevisForClient,
  useCreateDevis,
  useUpdateDevis,
} from '../hooks/use-clients'
import { useContractsForClient, useUploadContract, useSoftDeleteContract } from '../hooks/use-contracts'
import {
  useCommissionsForClient,
  useInvoicesForClient,
  useUploadInvoice,
  useSoftDeleteInvoice,
} from '../hooks/use-financial'
import { getContractPublicUrl } from '../services/contract-service'
import { getInvoicePublicUrl } from '../services/financial-service'
import type { ClientStatus, ProjectStatus, DevisStatus } from '@/types/enums'
import {
  PROJECT_STATUS_LABELS,
  DEVIS_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  COMMISSION_STATUS_LABELS,
  COMMISSION_STATUS_COLORS,
  INVOICE_TYPE_LABELS,
} from '@/types/enums'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/shared/status-badge'
import { EditableField } from '@/components/shared/editable-field'
import { ClientDeleteDialog } from '../components/client-delete-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDate, formatDateShort, formatCurrency } from '@/lib/format'
import {
  ArrowLeft,
  Pencil,
  Save,
  X,
  Plus,
  FolderKanban,
  FileText,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  FileCheck,
  CreditCard,
  RefreshCcw,
  Calendar,
  Clock,
  Upload,
  Eye,
  Trash2,
  DollarSign,
  Receipt,
} from 'lucide-react'
import { toast } from 'sonner'
import { useOpportunitiesForClient } from '@/features/opportunities/hooks/use-opportunities'
import { OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_STATUS_COLORS } from '@/types/enums'
import { Zap, UserPlus, Workflow, Inbox, FileSignature, TrendingUp, Sparkles, Euro } from 'lucide-react'
import { PortalInviteDialog } from '@/features/portal/components/portal-invite-dialog'
import { AccompagnementStepper } from '@/components/shared/accompagnement-stepper'
import { StepValidationDialog } from '@/features/accompagnement/components/step-validation-dialog'
import { useStepsForClient, useClientKpis, usePortalDocsForClient } from '@/features/accompagnement/hooks/use-accompagnement'
import { useAdminPortalLeadsRealtime } from '@/features/dashboard/hooks/use-admin-portal-leads-realtime'
import { validateOnboarding } from '@/features/portal-admin/services/admin-onboarding-service'
import { useQueryClient } from '@tanstack/react-query'
import { StatCard } from '@/components/shared/stat-card'
import { CommissionsToValidateSection } from '../components/commissions-to-validate-section'
import type { ClientAccompagnementStep } from '@/types'

const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  actif: 'Actif',
  inactif: 'Inactif',
  resilie: 'Résilié',
}

const CLIENT_STATUS_COLORS: Record<ClientStatus, string> = {
  actif: 'bg-green-100 text-green-800',
  inactif: 'bg-gray-100 text-gray-800',
  resilie: 'bg-red-100 text-red-800',
}

const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  onboarding: 'bg-blue-100 text-blue-800',
  en_cours: 'bg-green-100 text-green-800',
  en_attente: 'bg-yellow-100 text-yellow-800',
  termine: 'bg-gray-100 text-gray-800',
  resilie: 'bg-red-100 text-red-800',
}

const DEVIS_STATUS_COLORS: Record<DevisStatus, string> = {
  brouillon: 'bg-gray-100 text-gray-800',
  envoye: 'bg-blue-100 text-blue-800',
  signe: 'bg-green-100 text-green-800',
  refuse: 'bg-red-100 text-red-800',
  expire: 'bg-orange-100 text-orange-800',
}

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: client, isLoading, error } = useClient(id)
  const updateClient = useUpdateClient()
  const [isEditing, setIsEditing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editData, setEditData] = useState<Record<string, string>>({})
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [stepDialogOpen, setStepDialogOpen] = useState(false)
  const [selectedStep, setSelectedStep] = useState<ClientAccompagnementStep | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (error || !client) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/clients')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Retour
        </Button>
        <p className="text-destructive">Client introuvable.</p>
      </div>
    )
  }

  function startEditing() {
    // Mode "Modifier" → ne couvre PLUS que les notes (les autres champs sont
    // édités inline via <EditableField>). On capture uniquement les notes.
    setEditData({
      notes: client!.notes ?? '',
    })
    setIsEditing(true)
  }

  async function saveEdits() {
    try {
      await updateClient.mutateAsync({
        id: client!.id,
        updates: {
          notes: editData.notes || null,
        },
      })
      toast.success('Notes mises à jour')
      setIsEditing(false)
    } catch {
      toast.error('Erreur lors de la mise à jour')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/clients')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{client.company_name}</h1>
            <p className="text-sm text-muted-foreground">
              {client.contact_firstname} {client.contact_name}
              {client.city && ` · ${client.city}`}
            </p>
          </div>
          <StatusBadge
            label={CLIENT_STATUS_LABELS[client.status]}
            colorClass={CLIENT_STATUS_COLORS[client.status]}
          />
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                <X className="mr-1 h-4 w-4" /> Annuler
              </Button>
              <Button size="sm" onClick={saveEdits} disabled={updateClient.isPending}>
                <Save className="mr-1 h-4 w-4" /> Enregistrer les notes
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={startEditing}>
                <Pencil className="mr-1 h-4 w-4" /> Modifier les notes
              </Button>
              {!client.portal_enabled && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-violet-300 text-violet-700 hover:bg-violet-50"
                  onClick={() => setInviteDialogOpen(true)}
                >
                  <UserPlus className="mr-1 h-4 w-4" /> Inviter portail
                </Button>
              )}
              {client.portal_enabled && (
                <>
                  <Badge className="bg-violet-100 text-violet-700">Portail actif</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-violet-300 text-violet-700 hover:bg-violet-50"
                    onClick={() => window.open(`/portal/dashboard?as_client=${client.id}`, '_blank')}
                  >
                    <Workflow className="mr-1 h-4 w-4" /> Voir le portail
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Supprimer
              </Button>
            </>
          )}
        </div>
      </div>

      <ClientDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        clientId={client.id}
        companyName={client.company_name}
        onDeleted={() => navigate('/clients')}
      />

      {/* Accompagnement (5-step post-signature flow) */}
      <AccompagnementCard
        clientId={client.id}
        onStepClick={(s) => {
          setSelectedStep(s)
          setStepDialogOpen(true)
        }}
      />

      <Tabs defaultValue="fiche">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="fiche">Fiche</TabsTrigger>
          <TabsTrigger value="projet">Projet</TabsTrigger>
          <TabsTrigger value="devis">Devis</TabsTrigger>
          <TabsTrigger value="contrats">
            <FileCheck className="h-3.5 w-3.5 mr-1" /> Contrats
          </TabsTrigger>
          <TabsTrigger value="paiements">
            <CreditCard className="h-3.5 w-3.5 mr-1" /> Paiements
          </TabsTrigger>
          <TabsTrigger value="finances">
            <DollarSign className="h-3.5 w-3.5 mr-1" /> Finances
          </TabsTrigger>
          <TabsTrigger value="suivi">
            <RefreshCcw className="h-3.5 w-3.5 mr-1" /> Suivi
          </TabsTrigger>
          <TabsTrigger value="opportunites">
            <Zap className="h-3.5 w-3.5 mr-1" /> Opportunités
          </TabsTrigger>
        </TabsList>

        {/* Fiche tab */}
        <TabsContent value="fiche" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informations client</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <EditableField
                label="Entreprise"
                value={client.company_name}
                onSave={async (v) => { await updateClient.mutateAsync({ id: client.id, updates: { company_name: v ?? '' } }) }}
                validate={(v) => (v.trim() === '' ? 'Requis' : null)}
              />
              <EditableField
                label="Téléphone"
                type="tel"
                mono
                value={client.phone}
                onSave={async (v) => { await updateClient.mutateAsync({ id: client.id, updates: { phone: v ?? '' } }) }}
                validate={(v) => (v.trim() === '' ? 'Requis' : null)}
              />
              <EditableField
                label="Prénom"
                value={client.contact_firstname}
                onSave={async (v) => { await updateClient.mutateAsync({ id: client.id, updates: { contact_firstname: v } }) }}
              />
              <EditableField
                label="Nom"
                value={client.contact_name}
                onSave={async (v) => { await updateClient.mutateAsync({ id: client.id, updates: { contact_name: v } }) }}
              />
              <EditableField
                label="Email"
                type="email"
                value={client.contact_email}
                onSave={async (v) => { await updateClient.mutateAsync({ id: client.id, updates: { contact_email: v } }) }}
                validate={(v) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Email invalide' : null)}
              />
              <EditableField
                label="Ville"
                value={client.city}
                onSave={async (v) => { await updateClient.mutateAsync({ id: client.id, updates: { city: v } }) }}
              />
              <EditableField
                label="Adresse"
                value={client.address}
                onSave={async (v) => { await updateClient.mutateAsync({ id: client.id, updates: { address: v } }) }}
              />
              <EditableField
                label="Site web"
                type="url"
                value={client.website}
                onSave={async (v) => { await updateClient.mutateAsync({ id: client.id, updates: { website: v } }) }}
              />
              <EditableField
                label="ID business LSA"
                mono
                placeholder="ID Google LSA — mappe les leads entrants vers ce client"
                value={client.lsa_business_id ?? null}
                onSave={async (v) => { await updateClient.mutateAsync({ id: client.id, updates: { lsa_business_id: v || null } }) }}
              />
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

          {!isEditing && client.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{client.notes}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Détails</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Commercial</span>
                <span className="font-medium">{client.commercial?.full_name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span className="font-medium">{client.source === 'csv_import' ? 'CSV' : client.source}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Converti le</span>
                <span className="font-medium">{formatDate(client.converted_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Créé le</span>
                <span className="font-medium">{formatDate(client.created_at)}</span>
              </div>
              {client.prospect_id && (
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 h-auto"
                  onClick={() => navigate(`/prospects/${client.prospect_id}`)}
                >
                  Voir le prospect d'origine
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Projet tab */}
        <TabsContent value="projet">
          <ProjectTab clientId={client.id} />
        </TabsContent>

        {/* Devis tab - now passes projectId from ProjectTab context */}
        <TabsContent value="devis">
          <DevisTabWithProject clientId={client.id} />
        </TabsContent>

        {/* Contrats tab */}
        <TabsContent value="contrats">
          <ContratsTab clientId={client.id} />
        </TabsContent>

        {/* Paiements tab */}
        <TabsContent value="paiements">
          <PaiementsTab clientId={client.id} />
        </TabsContent>

        {/* Finances tab */}
        <TabsContent value="finances">
          <FinancesTab clientId={client.id} />
        </TabsContent>

        {/* Suivi tab */}
        <TabsContent value="suivi">
          <SuiviTab clientId={client.id} convertedAt={client.converted_at} />
        </TabsContent>

        {/* Opportunites tab */}
        <TabsContent value="opportunites">
          <OpportunitesTab clientId={client.id} />
        </TabsContent>
      </Tabs>

      {/* Portal invite dialog — collects contract data + creates account + sends email */}
      <PortalInviteDialog
        client={client}
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onSuccess={() => window.location.reload()}
      />

      {/* Accompagnement step validation dialog */}
      <StepValidationDialog
        open={stepDialogOpen}
        onOpenChange={setStepDialogOpen}
        step={selectedStep}
      />
    </div>
  )
}

function PortalValidationBanner({ clientId }: { clientId: string }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const { data: portalRow } = usePortalDocsForClient(clientId)
  const [submitting, setSubmitting] = useState(false)

  if (!portalRow) return null

  // Onboarding déjà validé : petit récap discret
  if (portalRow.status === 'validated') {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        Onboarding validé{portalRow.validated_at && ` le ${new Date(portalRow.validated_at).toLocaleDateString('fr-FR')}`}.
        L'artisan peut accéder à son dashboard portail.
      </div>
    )
  }

  // Soumis par l'artisan, en attente de validation par Celexia
  if (portalRow.status !== 'pending_validation') return null

  async function handleValidate() {
    if (!profile || !portalRow) return
    setSubmitting(true)
    try {
      // Le trigger DB trg_portal_validated_email enverra l'email automatiquement.
      await validateOnboarding(portalRow.id, profile.id)
      await queryClient.invalidateQueries({ queryKey: ['portal-docs', clientId] })
      await queryClient.invalidateQueries({ queryKey: ['accompagnement', clientId] })
      toast.success('Onboarding validé · email envoyé à l\'artisan')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Échec de la validation : ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-violet-300 bg-violet-50 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-violet-600 text-white">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-violet-900">
            L'artisan a soumis son onboarding pour validation
          </div>
          <div className="text-xs text-violet-800/80">
            Vérifiez les documents fournis (cliquez sur les étapes ci-dessous), puis validez ou demandez des corrections.
          </div>
        </div>
      </div>
      <Button
        size="sm"
        onClick={handleValidate}
        disabled={submitting}
        className="bg-violet-600 hover:bg-violet-700"
      >
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
        Valider l'onboarding
      </Button>
    </div>
  )
}

function AccompagnementCard({
  clientId,
  onStepClick,
}: {
  clientId: string
  onStepClick: (step: ClientAccompagnementStep) => void
}) {
  const { data: steps, isLoading } = useStepsForClient(clientId)
  const { data: kpis } = useClientKpis(clientId)
  // Refresh auto quand l'artisan déclare un paiement, signe un devis,
  // etc. côté portail. Sinon le fondateur doit F5 pour voir bouger les
  // KPIs et la section "Commissions à valider".
  useAdminPortalLeadsRealtime(clientId)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Workflow className="h-4 w-4 text-violet-600" />
          Accompagnement
        </CardTitle>
      </CardHeader>
      <CardContent>
        <PortalValidationBanner clientId={clientId} />
        {isLoading || !steps ? (
          <Skeleton className="h-24" />
        ) : (
          <AccompagnementStepper
            steps={steps}
            variant="detailed"
            onStepClick={onStepClick}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          <StatCard
            title="Leads reçus"
            value={kpis?.leadsCount ?? 0}
            icon={Inbox}
          />
          <StatCard
            title="Devis signés"
            value={kpis?.signedDealsCount ?? 0}
            icon={FileSignature}
          />
          <StatCard
            title="Commission générée"
            value={formatCurrency(kpis?.totalCommissionGenerated ?? 0)}
            icon={TrendingUp}
          />
          <StatCard
            title="Commission encaissée"
            value={formatCurrency(kpis?.totalCommissionPaid ?? 0)}
            icon={Euro}
          />
        </div>

        <CommissionsToValidateSection clientId={clientId} />
      </CardContent>
    </Card>
  )
}

// DevisTab wrapper that fetches project and passes its ID
function DevisTabWithProject({ clientId }: { clientId: string }) {
  const { data: project } = useProjectForClient(clientId)
  return <DevisTab clientId={clientId} projectId={project?.id} />
}

function ProjectTab({ clientId }: { clientId: string }) {
  const { profile } = useAuth()
  const { data: project, isLoading } = useProjectForClient(clientId)
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const { data: notes } = useProjectNotes(project?.id)
  const createNote = useCreateProjectNote()

  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [monthlyAmount, setMonthlyAmount] = useState('')
  const [newNote, setNewNote] = useState('')

  if (isLoading) return <Skeleton className="h-48" />

  if (!project && !showCreate) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Aucun projet</p>
          <p className="text-sm text-muted-foreground mb-4">Créez un projet pour ce client.</p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> Créer un projet
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (showCreate && !project) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nouveau projet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nom du projet *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Site web + SEO" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Montant mensuel (EUR)</Label>
            <Input type="number" value={monthlyAmount} onChange={(e) => setMonthlyAmount(e.target.value)} placeholder="0" />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Annuler</Button>
            <Button
              disabled={!name.trim() || createProject.isPending}
              onClick={async () => {
                try {
                  await createProject.mutateAsync({
                    client_id: clientId,
                    name: name.trim(),
                    description: description.trim() || null,
                    monthly_amount: monthlyAmount ? parseFloat(monthlyAmount) : null,
                  })
                  toast.success('Projet créé')
                  setShowCreate(false)
                } catch {
                  toast.error('Erreur')
                }
              }}
            >
              {createProject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Créer
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!project) return null

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{project.name}</CardTitle>
          <StatusBadge
            label={PROJECT_STATUS_LABELS[project.status]}
            colorClass={PROJECT_STATUS_COLORS[project.status]}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          {project.description && (
            <p className="text-sm text-muted-foreground">{project.description}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            {project.monthly_amount && (
              <div>
                <p className="text-muted-foreground">Mensuel</p>
                <p className="font-medium">{formatCurrency(project.monthly_amount)}</p>
              </div>
            )}
            {project.total_amount && (
              <div>
                <p className="text-muted-foreground">Total</p>
                <p className="font-medium">{formatCurrency(project.total_amount)}</p>
              </div>
            )}
            {project.start_date && (
              <div>
                <p className="text-muted-foreground">Début</p>
                <p className="font-medium">{formatDateShort(project.start_date)}</p>
              </div>
            )}
          </div>

          {/* Status change */}
          <div className="flex items-center gap-3">
            <Label className="text-sm">Statut :</Label>
            <Select
              value={project.status}
              onValueChange={async (v) => {
                try {
                  await updateProject.mutateAsync({ id: project.id, updates: { status: v as ProjectStatus } })
                  toast.success('Statut mis à jour')
                } catch {
                  toast.error('Erreur')
                }
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(PROJECT_STATUS_LABELS) as [ProjectStatus, string][]).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Project notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes du projet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Ajouter une note..."
              rows={2}
              className="flex-1"
            />
            <Button
              disabled={!newNote.trim() || createNote.isPending}
              onClick={async () => {
                if (!profile) return
                try {
                  await createNote.mutateAsync({
                    project_id: project.id,
                    author_id: profile.id,
                    content: newNote.trim(),
                  })
                  setNewNote('')
                  toast.success('Note ajoutée')
                } catch {
                  toast.error('Erreur')
                }
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Separator />
          {!notes || notes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucune note</p>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{note.author?.full_name}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(note.created_at)}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function DevisTab({ clientId, projectId }: { clientId: string; projectId: string | undefined }) {
  const { profile } = useAuth()
  const { data: devisList, isLoading } = useDevisForClient(clientId)
  const createDevis = useCreateDevis()
  const updateDevis = useUpdateDevis()

  const [showCreate, setShowCreate] = useState(false)
  const [amountHt, setAmountHt] = useState('')
  const [taxRate, setTaxRate] = useState('20')
  const [devisNotes, setDevisNotes] = useState('')

  if (isLoading) return <Skeleton className="h-48" />

  return (
    <div className="space-y-6">
      {/* Create form */}
      {showCreate ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nouveau devis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Montant HT (EUR) *</Label>
                <Input type="number" value={amountHt} onChange={(e) => setAmountHt(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Taux TVA (%)</Label>
                <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </div>
            </div>
            {amountHt && (
              <p className="text-sm text-muted-foreground">
                Montant TTC : {formatCurrency(parseFloat(amountHt) * (1 + parseFloat(taxRate || '0') / 100))}
              </p>
            )}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={devisNotes} onChange={(e) => setDevisNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Annuler</Button>
              <Button
                disabled={!amountHt || createDevis.isPending}
                onClick={async () => {
                  if (!profile) return
                  try {
                    await createDevis.mutateAsync({
                      client_id: clientId,
                      project_id: projectId ?? null,
                      amount_ht: parseFloat(amountHt),
                      tax_rate: parseFloat(taxRate || '20'),
                      notes: devisNotes.trim() || null,
                      created_by: profile.id,
                    })
                    toast.success('Devis créé')
                    setShowCreate(false)
                    setAmountHt('')
                    setDevisNotes('')
                  } catch {
                    toast.error('Erreur')
                  }
                }}
              >
                {createDevis.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Créer le devis
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nouveau devis
        </Button>
      )}

      {/* Devis list */}
      {!devisList || devisList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Aucun devis</p>
            <p className="text-sm text-muted-foreground">Créez un devis pour ce client.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {devisList.map((devis) => (
            <Card key={devis.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{devis.reference || `DEV-${devis.id.slice(0, 8)}`}</p>
                      <StatusBadge
                        label={DEVIS_STATUS_LABELS[devis.status]}
                        colorClass={DEVIS_STATUS_COLORS[devis.status]}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatCurrency(devis.amount_ht)} HT · {formatCurrency(devis.amount_ttc)} TTC
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Créé le {formatDateShort(devis.created_at)}
                      {devis.valid_until && ` · Valide jusqu'au ${formatDateShort(devis.valid_until)}`}
                    </p>
                    {devis.notes && (
                      <p className="text-sm text-muted-foreground mt-2">{devis.notes}</p>
                    )}
                  </div>
                  {/* Status actions */}
                  <div className="flex gap-1 shrink-0">
                    {devis.status === 'brouillon' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await updateDevis.mutateAsync({
                              id: devis.id,
                              updates: { status: 'envoye', sent_at: new Date().toISOString() },
                            })
                            toast.success('Devis marqué comme envoyé')
                          } catch { toast.error('Erreur') }
                        }}
                      >
                        <Send className="h-3 w-3 mr-1" /> Envoyer
                      </Button>
                    )}
                    {devis.status === 'envoye' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await updateDevis.mutateAsync({
                                id: devis.id,
                                updates: { status: 'signe', signed_at: new Date().toISOString() },
                              })
                              toast.success('Devis signé !')
                            } catch { toast.error('Erreur') }
                          }}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Signé
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              await updateDevis.mutateAsync({
                                id: devis.id,
                                updates: { status: 'refuse', refused_at: new Date().toISOString() },
                              })
                              toast.success('Devis refusé')
                            } catch { toast.error('Erreur') }
                          }}
                        >
                          <XCircle className="h-3 w-3 mr-1" /> Refusé
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// Contrats tab - drag & drop PDF upload + list
function ContratsTab({ clientId }: { clientId: string }) {
  const { profile } = useAuth()
  const { data: contractFiles, isLoading } = useContractsForClient(clientId)
  const uploadContract = useUploadContract()
  const deleteContract = useSoftDeleteContract()

  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || !profile) return
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.type !== 'application/pdf') {
        toast.error(`${file.name} n'est pas un PDF`)
        continue
      }
      try {
        await uploadContract.mutateAsync({
          clientId,
          uploadedBy: profile.id,
          file,
        })
        toast.success(`${file.name} uploade`)
      } catch {
        // Error toast handled by hook
      }
    }
  }, [clientId, profile, uploadContract])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  if (isLoading) return <Skeleton className="h-48" />

  return (
    <div className="space-y-6">
      {/* Drag & drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <Upload className={`h-10 w-10 mx-auto mb-3 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
        {uploadContract.isPending ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p className="text-sm text-muted-foreground">Upload en cours...</p>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium">
              Glissez-deposez vos contrats PDF ici
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              ou cliquez pour selectionner des fichiers
            </p>
          </>
        )}
      </div>

      {/* Contract list */}
      {!contractFiles || contractFiles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileCheck className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Aucun contrat</p>
            <p className="text-sm text-muted-foreground">Uploadez des contrats PDF via la zone ci-dessus.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-primary" />
              Contrats ({contractFiles.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fichier</TableHead>
                    <TableHead>Taille</TableHead>
                    <TableHead>Upload le</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contractFiles.map(c => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-red-500 shrink-0" />
                          <span className="text-sm font-medium truncate max-w-[250px]">{c.file_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {(c.file_size / 1024).toFixed(0)} Ko
                      </TableCell>
                      <TableCell className="text-sm">{formatDateShort(c.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const url = getContractPublicUrl(c.file_path)
                              window.open(url, '_blank')
                            }}
                          >
                            <Eye className="h-3 w-3 mr-1" /> Voir
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={deleteContract.isPending}
                            onClick={async () => {
                              if (!confirm('Supprimer ce contrat ?')) return
                              try {
                                await deleteContract.mutateAsync(c.id)
                                toast.success('Contrat supprime')
                              } catch {
                                // Error toast handled by hook
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Paiements tab - shows payment status derived from devis
function PaiementsTab({ clientId }: { clientId: string }) {
  const { data: devisList, isLoading } = useDevisForClient(clientId)

  const payments = useMemo(() => {
    if (!devisList) return []
    return devisList
      .filter(d => d.status !== 'brouillon')
      .map(d => {
        let paymentStatus: 'paye' | 'en_attente' | 'en_retard' | 'impaye' = 'en_attente'
        if (d.status === 'signe') paymentStatus = 'paye'
        else if (d.status === 'refuse') paymentStatus = 'impaye'
        else if (d.status === 'expire') paymentStatus = 'en_retard'
        else if (d.status === 'envoye') {
          // Check if sent more than 30 days ago
          if (d.sent_at) {
            const sentDate = new Date(d.sent_at)
            const now = new Date()
            const diffDays = Math.floor((now.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24))
            if (diffDays > 30) paymentStatus = 'en_retard'
          }
        }
        return {
          id: d.id,
          reference: d.reference || `DEV-${d.id.slice(0, 8)}`,
          amount_ttc: d.amount_ttc,
          status: paymentStatus,
          devis_status: d.status,
          created_at: d.created_at,
          sent_at: d.sent_at,
          signed_at: d.signed_at,
        }
      })
  }, [devisList])

  if (isLoading) return <Skeleton className="h-48" />

  if (payments.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Aucun paiement</p>
          <p className="text-sm text-muted-foreground">Les paiements seront dérivés des devis envoyés.</p>
        </CardContent>
      </Card>
    )
  }

  // Stats
  const stats = {
    paye: payments.filter(p => p.status === 'paye').reduce((s, p) => s + p.amount_ttc, 0),
    en_attente: payments.filter(p => p.status === 'en_attente').reduce((s, p) => s + p.amount_ttc, 0),
    en_retard: payments.filter(p => p.status === 'en_retard').reduce((s, p) => s + p.amount_ttc, 0),
    impaye: payments.filter(p => p.status === 'impaye').reduce((s, p) => s + p.amount_ttc, 0),
  }

  return (
    <div className="space-y-4">
      {/* Mini stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.entries(stats) as [keyof typeof stats, number][]).map(([status, amount]) => (
          <Card key={status}>
            <CardContent className="p-3">
              <Badge className={`text-xs mb-1 ${PAYMENT_STATUS_COLORS[status]}`}>
                {PAYMENT_STATUS_LABELS[status]}
              </Badge>
              <p className="text-lg font-bold">{formatCurrency(amount)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Suivi des paiements ({payments.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead className="text-right">Montant TTC</TableHead>
                  <TableHead>Statut paiement</TableHead>
                  <TableHead>Statut devis</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">{p.reference}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(p.amount_ttc)}</TableCell>
                    <TableCell>
                      <Badge className={PAYMENT_STATUS_COLORS[p.status]}>
                        {PAYMENT_STATUS_LABELS[p.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={DEVIS_STATUS_LABELS[p.devis_status]}
                        colorClass={DEVIS_STATUS_COLORS[p.devis_status]}
                      />
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.signed_at ? formatDateShort(p.signed_at) : p.sent_at ? formatDateShort(p.sent_at) : formatDateShort(p.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Suivi tab - long-term follow-up info
function SuiviTab({ clientId, convertedAt }: { clientId: string; convertedAt: string }) {
  const now = new Date()
  const convertedDate = new Date(convertedAt)
  const monthsSince = (now.getFullYear() - convertedDate.getFullYear()) * 12 + (now.getMonth() - convertedDate.getMonth())

  // Fetch recent activities for this client (devis, projects)
  const { data: devisList } = useDevisForClient(clientId)
  const { data: project } = useProjectForClient(clientId)

  // Build timeline
  const timeline = useMemo(() => {
    const events: { date: string; label: string; type: 'info' | 'success' | 'warning' }[] = []

    events.push({ date: convertedAt, label: 'Converti en client', type: 'success' })

    if (project?.start_date) {
      events.push({ date: project.start_date, label: `Projet "${project.name}" démarré`, type: 'info' })
    }
    if (project?.end_date) {
      events.push({ date: project.end_date, label: `Projet "${project.name}" terminé`, type: 'warning' })
    }

    devisList?.forEach(d => {
      if (d.signed_at) events.push({ date: d.signed_at, label: `Devis ${d.reference || d.id.slice(0, 8)} signé`, type: 'success' })
      if (d.sent_at) events.push({ date: d.sent_at, label: `Devis ${d.reference || d.id.slice(0, 8)} envoyé`, type: 'info' })
    })

    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [convertedAt, project, devisList])

  let category = 'Récent'
  if (monthsSince >= 24) category = 'Relance 2 ans+'
  else if (monthsSince >= 12) category = 'Relance 1 an'
  else if (monthsSince >= 6) category = 'Relance 6 mois'

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{monthsSince}</p>
                <p className="text-sm text-muted-foreground">mois d'ancienneté</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <RefreshCcw className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-lg font-bold">{category}</p>
                <p className="text-sm text-muted-foreground">Catégorie de suivi</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <FileCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{devisList?.filter(d => d.status === 'signe').length ?? 0}</p>
                <p className="text-sm text-muted-foreground">devis signés</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Historique client
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun événement</p>
          ) : (
            <div className="space-y-3">
              {timeline.map((event, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                    event.type === 'success' ? 'bg-green-500' :
                    event.type === 'warning' ? 'bg-orange-500' :
                    'bg-blue-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{event.label}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(event.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Finances tab - Commissions (par lead signé) + Factures
// Note : les sections "Création commission mensuelle" et "Budget publicitaire"
// ont été retirées avec la migration 00100 (tables `commissions` et
// `budget_payments` dropées, jamais utilisées en prod). Le flow commission
// est désormais piloté de bout en bout par le workflow portail artisan
// (J'ai payé) → admin (Valider/À clarifier dans la carte Accompagnement).
function FinancesTab({ clientId }: { clientId: string }) {
  const { profile } = useAuth()

  // Data
  const { data: commissions, isLoading: loadingCommissions } = useCommissionsForClient(clientId)
  const { data: invoices, isLoading: loadingInvoices } = useInvoicesForClient(clientId)

  // Mutations
  const uploadInvoice = useUploadInvoice()
  const deleteInvoice = useSoftDeleteInvoice()

  // Invoice form state
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [invoiceType, setInvoiceType] = useState<'commission' | 'budget_pub'>('commission')
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const invoiceInputRef = useRef<HTMLInputElement>(null)

  const isLoading = loadingCommissions || loadingInvoices

  // Summary calculations
  const totalCommissionsDues = useMemo(() =>
    (commissions ?? [])
      .filter(c => c.status !== 'recu')
      .reduce((sum, c) => sum + Number(c.commission_amount), 0)
  , [commissions])

  const totalCommissionsRecues = useMemo(() =>
    (commissions ?? [])
      .filter(c => c.status === 'recu')
      .reduce((sum, c) => sum + Number(c.commission_amount), 0)
  , [commissions])

  const lastInvoice = useMemo(() =>
    invoices && invoices.length > 0 ? invoices[0] : null
  , [invoices])

  if (isLoading) return <Skeleton className="h-48" />

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-100">
                <DollarSign className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xl font-bold">{formatCurrency(totalCommissionsDues)}</p>
                <p className="text-sm text-muted-foreground">Commissions à recevoir</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <CreditCard className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xl font-bold">{formatCurrency(totalCommissionsRecues)}</p>
                <p className="text-sm text-muted-foreground">Commissions reçues</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <Receipt className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium truncate max-w-[180px]">
                  {lastInvoice ? lastInvoice.file_name : 'Aucune'}
                </p>
                <p className="text-sm text-muted-foreground">Derniere facture</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 1: Commissions par lead signé */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Commissions par lead signé
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Validation des paiements via la carte <strong>Accompagnement</strong> ci-dessus quand l'artisan déclare avoir payé.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!commissions || commissions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun devis signé</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Signé le</TableHead>
                    <TableHead className="text-right">Montant signé</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.lead_name ?? '—'}</TableCell>
                      <TableCell>
                        {new Date(c.month + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(c.revenue_generated))}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(Number(c.commission_amount))}</TableCell>
                      <TableCell>
                        <Badge className={COMMISSION_STATUS_COLORS[c.status]}>
                          {COMMISSION_STATUS_LABELS[c.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Factures */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            Factures ({invoices?.length ?? 0})
          </CardTitle>
          <Button size="sm" onClick={() => setShowInvoiceForm(v => !v)}>
            <Plus className="h-4 w-4 mr-1" /> Ajouter une facture
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {showInvoiceForm && (
            <div className="rounded-lg border p-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Fichier PDF *</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => invoiceInputRef.current?.click()}
                    >
                      <Upload className="h-3 w-3 mr-1" /> Choisir un fichier
                    </Button>
                    <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                      {invoiceFile ? invoiceFile.name : 'Aucun fichier'}
                    </span>
                    <input
                      ref={invoiceInputRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) setInvoiceFile(f)
                        e.target.value = ''
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Type *</Label>
                  <Select
                    value={invoiceType}
                    onValueChange={(v) => setInvoiceType(v as 'commission' | 'budget_pub')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="commission">Commission</SelectItem>
                      <SelectItem value="budget_pub">Budget pub</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Montant (EUR) *</Label>
                  <Input
                    type="number"
                    value={invoiceAmount}
                    onChange={(e) => setInvoiceAmount(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date facture *</Label>
                  <Input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} placeholder="Optionnel" />
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => { setShowInvoiceForm(false); setInvoiceFile(null) }}>Annuler</Button>
                <Button
                  disabled={!invoiceFile || !invoiceAmount || !invoiceDate || uploadInvoice.isPending}
                  onClick={async () => {
                    if (!profile || !invoiceFile) return
                    try {
                      await uploadInvoice.mutateAsync({
                        clientId,
                        uploadedBy: profile.id,
                        file: invoiceFile,
                        amount: parseFloat(invoiceAmount),
                        invoiceDate: invoiceDate,
                        type: invoiceType,
                        notes: invoiceNotes.trim() || null,
                      })
                      toast.success('Facture ajoutee')
                      setShowInvoiceForm(false)
                      setInvoiceFile(null)
                      setInvoiceAmount('')
                      setInvoiceDate('')
                      setInvoiceNotes('')
                    } catch {
                      // Error handled by hook
                    }
                  }}
                >
                  {uploadInvoice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Ajouter
                </Button>
              </div>
            </div>
          )}

          {!invoices || invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucune facture</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fichier</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-red-500 shrink-0" />
                          <span className="text-sm font-medium truncate max-w-[200px]">{inv.file_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(Number(inv.amount))}</TableCell>
                      <TableCell>{formatDateShort(inv.invoice_date)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {INVOICE_TYPE_LABELS[inv.type as keyof typeof INVOICE_TYPE_LABELS]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const url = getInvoicePublicUrl(inv.file_path)
                              window.open(url, '_blank')
                            }}
                          >
                            <Eye className="h-3 w-3 mr-1" /> Voir
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={deleteInvoice.isPending}
                            onClick={async () => {
                              if (!confirm('Supprimer cette facture ?')) return
                              try {
                                await deleteInvoice.mutateAsync(inv.id)
                                toast.success('Facture supprimee')
                              } catch {
                                // Error handled by hook
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function OpportunitesTab({ clientId }: { clientId: string }) {
  const { data: opportunities, isLoading } = useOpportunitiesForClient(clientId)

  if (isLoading) return <Skeleton className="h-48" />

  if (!opportunities || opportunities.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Zap className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Aucune opportunité</p>
          <p className="text-sm text-muted-foreground">Les opportunités liées à ce client apparaîtront ici.</p>
        </CardContent>
      </Card>
    )
  }

  const totalPrice = opportunities.reduce((s, o) => s + o.project_price, 0)
  const totalCollected = opportunities.reduce((s, o) => s + o.amount_collected, 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total projets</p>
            <p className="text-lg font-bold">{formatCurrency(totalPrice)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-emerald-600">Encaissé</p>
            <p className="text-lg font-bold text-emerald-600">{formatCurrency(totalCollected)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-orange-600">Reste</p>
            <p className="text-lg font-bold text-orange-600">{formatCurrency(totalPrice - totalCollected)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        {opportunities.map(opp => (
          <Card key={opp.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{opp.name}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {formatCurrency(opp.project_price)}
                    {opp.amount_collected > 0 && (
                      <span className="text-emerald-600 ml-2">
                        ({formatCurrency(opp.amount_collected)} encaissé)
                      </span>
                    )}
                  </p>
                </div>
                <StatusBadge
                  label={OPPORTUNITY_STATUS_LABELS[opp.status]}
                  colorClass={OPPORTUNITY_STATUS_COLORS[opp.status]}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
