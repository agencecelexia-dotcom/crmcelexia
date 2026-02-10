import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
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
import type { ClientStatus, ProjectStatus, DevisStatus } from '@/types/enums'
import { PROJECT_STATUS_LABELS, DEVIS_STATUS_LABELS } from '@/types/enums'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/shared/status-badge'
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
} from 'lucide-react'
import { toast } from 'sonner'

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
  const [editData, setEditData] = useState<Record<string, string>>({})

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
    setEditData({
      company_name: client!.company_name,
      contact_name: client!.contact_name ?? '',
      contact_firstname: client!.contact_firstname ?? '',
      contact_email: client!.contact_email ?? '',
      phone: client!.phone,
      city: client!.city ?? '',
      address: client!.address ?? '',
      website: client!.website ?? '',
      notes: client!.notes ?? '',
    })
    setIsEditing(true)
  }

  async function saveEdits() {
    try {
      await updateClient.mutateAsync({
        id: client!.id,
        updates: {
          company_name: editData.company_name,
          contact_name: editData.contact_name || null,
          contact_firstname: editData.contact_firstname || null,
          contact_email: editData.contact_email || null,
          phone: editData.phone,
          city: editData.city || null,
          address: editData.address || null,
          website: editData.website || null,
          notes: editData.notes || null,
        } as never,
      })
      toast.success('Client mis à jour')
      setIsEditing(false)
    } catch {
      toast.error('Erreur lors de la mise à jour')
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
        <p className="text-sm">{(client as unknown as Record<string, unknown>)[key] as string || '—'}</p>
      )}
    </div>
  )

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

      <Tabs defaultValue="fiche">
        <TabsList>
          <TabsTrigger value="fiche">Fiche</TabsTrigger>
          <TabsTrigger value="projet">Projet</TabsTrigger>
          <TabsTrigger value="devis">Devis</TabsTrigger>
        </TabsList>

        {/* Fiche tab */}
        <TabsContent value="fiche" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informations client</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {field('company_name', 'Entreprise')}
              {field('phone', 'Téléphone')}
              {field('contact_firstname', 'Prénom')}
              {field('contact_name', 'Nom')}
              {field('contact_email', 'Email')}
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

        {/* Devis tab */}
        <TabsContent value="devis">
          <DevisTab clientId={client.id} projectId={undefined} />
        </TabsContent>
      </Tabs>
    </div>
  )
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
