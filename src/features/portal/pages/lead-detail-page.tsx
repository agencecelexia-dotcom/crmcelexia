import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePortalLead, usePortalLeadEvents, useUpdatePortalLeadStatus, useUpdatePortalLead, useDeletePortalLead } from '../hooks/use-portal-leads'
import { PORTAL_LEAD_STATUS_LABELS, PORTAL_LEAD_STATUS_COLORS, PORTAL_LEAD_SOURCE_LABELS } from '@/types/enums'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Phone, MapPin, Calendar, CheckCircle2, Trash2, Loader2, Euro } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/format'

export function PortalLeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: lead, isLoading } = usePortalLead(id)
  const { data: events } = usePortalLeadEvents(id)
  const updateStatus = useUpdatePortalLeadStatus()
  const updateLead = useUpdatePortalLead()
  const deleteLead = useDeletePortalLead()

  const [notes, setNotes] = useState<string | null>(null)
  const [signDialogOpen, setSignDialogOpen] = useState(false)
  const [signedAmount, setSignedAmount] = useState('')
  const [signedDate, setSignedDate] = useState(new Date().toISOString().split('T')[0])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  if (isLoading || !lead) {
    return <Skeleton className="h-96 rounded-xl" />
  }

  const currentNotes = notes ?? lead.notes ?? ''

  async function saveNotes() {
    if (notes === null || notes === lead?.notes) return
    await updateLead.mutateAsync({ id: lead!.id, updates: { notes } })
    toast.success('Notes sauvegardées')
  }

  async function handleSign() {
    const amount = parseFloat(signedAmount)
    if (!amount || amount <= 0) { toast.error('Montant invalide'); return }
    await updateStatus.mutateAsync({
      id: lead!.id,
      newStatus: 'signe',
      oldStatus: lead!.status,
      extra: { signed_amount: amount, signed_at: signedDate },
    })
    setSignDialogOpen(false)
    toast.success('Lead marqué comme signé !')
  }

  async function handleDelete() {
    await deleteLead.mutateAsync(lead!.id)
    navigate('/portal/leads')
  }

  const commission = lead.signed_amount ? (lead.signed_amount * (lead.commission_rate || 0.10)) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/portal/leads')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{lead.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge className={PORTAL_LEAD_STATUS_COLORS[lead.status]}>
              {PORTAL_LEAD_STATUS_LABELS[lead.status]}
            </Badge>
            <span className="text-xs text-gray-400">{lead.work_type} · {PORTAL_LEAD_SOURCE_LABELS[lead.source]}</span>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left: info + notes + timeline */}
        <div className="md:col-span-2 space-y-4">
          {/* Contact */}
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {lead.phone && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <a href={`tel:${lead.phone}`} className="hover:text-violet-600">{lead.phone}</a>
                  </div>
                )}
                {lead.city && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <MapPin className="h-4 w-4 text-gray-400" /> {lead.city}
                  </div>
                )}
                <div className="flex items-center gap-2 text-gray-700">
                  <Calendar className="h-4 w-4 text-gray-400" /> Créé le {formatDate(lead.created_at)}
                </div>
                {lead.amount_estimated && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <Euro className="h-4 w-4 text-gray-400" /> Estimé {lead.amount_estimated.toLocaleString('fr-FR')} €
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={currentNotes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={saveNotes}
                rows={3}
                placeholder="Ajouter des notes..."
                className="text-sm"
              />
              {notes !== null && notes !== lead.notes && (
                <p className="text-xs text-amber-600 mt-1">Modifications non sauvegardées — cliquez ailleurs pour sauvegarder</p>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Historique</CardTitle>
            </CardHeader>
            <CardContent>
              {events && events.length > 0 ? (
                <div className="space-y-3">
                  {events.map(ev => (
                    <div key={ev.id} className="flex items-start gap-3">
                      <div className="mt-0.5 h-2 w-2 rounded-full bg-violet-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700">{ev.description}</p>
                        <p className="text-xs text-gray-400">{formatDate(ev.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Aucun événement</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: actions */}
        <div className="space-y-4">
          {/* Sign card */}
          {lead.status !== 'signe' && lead.status !== 'perdu' && (
            <Card className="border-violet-200">
              <CardContent className="pt-4">
                <Button
                  className="w-full bg-violet-600 hover:bg-violet-700"
                  onClick={() => setSignDialogOpen(true)}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Marquer comme signé
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Signed info */}
          {lead.status === 'signe' && lead.signed_amount && (
            <Card className="border-emerald-200 bg-emerald-50">
              <CardContent className="pt-4 space-y-2">
                <p className="text-sm font-semibold text-emerald-900">Devis signé</p>
                <p className="text-2xl font-bold text-emerald-700" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                  {lead.signed_amount.toLocaleString('fr-FR')} € HT
                </p>
                {lead.signed_at && <p className="text-xs text-emerald-600">Signé le {lead.signed_at}</p>}
                {commission && (
                  <div className="pt-2 border-t border-emerald-200">
                    <p className="text-xs text-emerald-600">Commission (10%) : <strong>{commission.toLocaleString('fr-FR')} €</strong></p>
                    <p className="text-xs text-emerald-500">Facturée le 1er du mois suivant</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Delete */}
          <Button variant="ghost" className="w-full text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Supprimer ce lead
          </Button>
        </div>
      </div>

      {/* Sign dialog */}
      <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Marquer comme signé</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Montant du devis (€ HT) *</Label>
              <Input type="number" value={signedAmount} onChange={(e) => setSignedAmount(e.target.value)} placeholder="5000" autoFocus />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date de signature</Label>
              <Input type="date" value={signedDate} onChange={(e) => setSignedDate(e.target.value)} />
            </div>
            {signedAmount && parseFloat(signedAmount) > 0 && (
              <div className="rounded-lg bg-violet-50 p-3 text-sm">
                <p className="text-violet-700">Commission (10%) : <strong>{(parseFloat(signedAmount) * 0.10).toLocaleString('fr-FR')} €</strong></p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSignDialogOpen(false)}>Annuler</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSign} disabled={updateStatus.isPending || !signedAmount}>
              {updateStatus.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Confirmer la signature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer ce lead ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">Cette action est irréversible.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLead.isPending}>
              {deleteLead.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
