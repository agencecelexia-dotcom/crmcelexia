import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { usePortalLeads, useCreatePortalLead, useUpdatePortalLeadStatus } from '../hooks/use-portal-leads'
import { PORTAL_LEAD_PIPELINE, PORTAL_LEAD_STATUS_LABELS, PORTAL_LEAD_STATUS_COLORS, PORTAL_LEAD_SOURCE_LABELS } from '@/types/enums'
import type { PortalLead } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Phone, MapPin, Search, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

function LeadCard({ lead, onDragStart, onClick }: {
  lead: PortalLead
  onDragStart: () => void
  onClick: () => void
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="rounded-xl border bg-white p-3.5 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-semibold text-gray-900 truncate">{lead.name}</p>
        {lead.is_urgent && <AlertCircle className="h-4 w-4 text-red-500 shrink-0 ml-1" />}
      </div>
      <div className="space-y-1 text-xs text-gray-500">
        {lead.phone && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3 w-3" /> {lead.phone}
          </div>
        )}
        {lead.city && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3" /> {lead.city}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-2.5">
        <Badge variant="outline" className="text-xs px-2 py-0.5">
          {lead.work_type}
        </Badge>
        <span className="text-xs font-medium text-gray-400">
          {PORTAL_LEAD_SOURCE_LABELS[lead.source]}
        </span>
      </div>
      {lead.amount_estimated && (
        <p className="text-xs font-semibold text-violet-600 mt-1.5">
          {lead.amount_estimated.toLocaleString('fr-FR')} €
        </p>
      )}
    </div>
  )
}

export function PortalLeadsKanbanPage() {
  const { client } = usePortalAuth()
  const { data: leads, isLoading } = usePortalLeads(client?.id)
  const createLead = useCreatePortalLead()
  const updateStatus = useUpdatePortalLeadStatus()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [newLeadOpen, setNewLeadOpen] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  // New lead form
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newWorkType, setNewWorkType] = useState('')
  const [newCity, setNewCity] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newSource, setNewSource] = useState<'lsa' | 'bao'>('lsa')
  const [newNotes, setNewNotes] = useState('')

  const filtered = useMemo(() => {
    if (!leads) return []
    if (!search.trim()) return leads
    const q = search.toLowerCase()
    return leads.filter(l =>
      l.name.toLowerCase().includes(q) ||
      l.work_type.toLowerCase().includes(q) ||
      l.city?.toLowerCase().includes(q)
    )
  }, [leads, search])

  const grouped = useMemo(() => {
    const map: Record<string, PortalLead[]> = {}
    for (const status of [...PORTAL_LEAD_PIPELINE, 'perdu' as const]) {
      map[status] = []
    }
    for (const lead of filtered) {
      if (map[lead.status]) map[lead.status].push(lead)
    }
    return map
  }, [filtered])

  function handleDrop(targetStatus: string) {
    if (!draggingId) return
    const lead = leads?.find(l => l.id === draggingId)
    if (!lead || lead.status === targetStatus) {
      setDraggingId(null)
      setDragOverCol(null)
      return
    }
    updateStatus.mutate({
      id: draggingId,
      newStatus: targetStatus,
      oldStatus: lead.status,
    })
    setDraggingId(null)
    setDragOverCol(null)
  }

  function resetNewLead() {
    setNewName(''); setNewPhone(''); setNewWorkType(''); setNewCity('')
    setNewAmount(''); setNewSource('lsa'); setNewNotes('')
  }

  async function handleCreateLead() {
    if (!client || !newName || !newPhone || !newWorkType) {
      toast.error('Nom, téléphone et type de travaux sont obligatoires')
      return
    }
    await createLead.mutateAsync({
      client_id: client.id,
      name: newName,
      phone: newPhone,
      work_type: newWorkType,
      city: newCity || undefined,
      amount_estimated: newAmount ? parseFloat(newAmount) : undefined,
      source: newSource,
      notes: newNotes || undefined,
    })
    resetNewLead()
    setNewLeadOpen(false)
  }

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-96 min-w-60 flex-1 rounded-xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
            Leads
          </h1>
          <p className="text-sm text-gray-500">{leads?.length || 0} leads au total</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="pl-9 w-48"
            />
          </div>
          <Button className="bg-violet-600 hover:bg-violet-700" onClick={() => setNewLeadOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nouveau lead
          </Button>
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[500px]">
        {[...PORTAL_LEAD_PIPELINE, 'perdu' as const].map(status => {
          const colLeads = grouped[status] || []
          const isDragOver = dragOverCol === status
          return (
            <div
              key={status}
              className={`min-w-[240px] flex-1 rounded-xl p-3 transition-colors ${
                isDragOver ? 'bg-violet-50 ring-2 ring-violet-300' : 'bg-gray-50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(status) }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={() => handleDrop(status)}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <Badge className={PORTAL_LEAD_STATUS_COLORS[status as keyof typeof PORTAL_LEAD_STATUS_COLORS] || 'bg-gray-100 text-gray-600'}>
                    {PORTAL_LEAD_STATUS_LABELS[status as keyof typeof PORTAL_LEAD_STATUS_LABELS] || status}
                  </Badge>
                  <span className="text-xs font-medium text-gray-400">{colLeads.length}</span>
                </div>
              </div>
              <div className="space-y-2.5">
                {colLeads.map(lead => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onDragStart={() => setDraggingId(lead.id)}
                    onClick={() => navigate(`/portal/leads/${lead.id}`)}
                  />
                ))}
                {colLeads.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-8">Aucun lead</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* New lead dialog */}
      <Dialog open={newLeadOpen} onOpenChange={(o) => { if (!o) resetNewLead(); setNewLeadOpen(o) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouveau lead</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nom du prospect *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Martin Dupont" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Téléphone *</Label>
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="06 12 34 56 78" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ville</Label>
                <Input value={newCity} onChange={(e) => setNewCity(e.target.value)} placeholder="Lyon" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Type de travaux *</Label>
                <Input value={newWorkType} onChange={(e) => setNewWorkType(e.target.value)} placeholder="Rénovation piscine" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Montant estimé (€)</Label>
                <Input type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="5000" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Source</Label>
              <Select value={newSource} onValueChange={(v) => setNewSource(v as 'lsa' | 'bao')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lsa">Google Ads</SelectItem>
                  <SelectItem value="bao">Bouche à oreille</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={2} placeholder="Infos supplémentaires..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { resetNewLead(); setNewLeadOpen(false) }}>Annuler</Button>
            <Button className="bg-violet-600 hover:bg-violet-700" onClick={handleCreateLead} disabled={createLead.isPending || !newName || !newPhone || !newWorkType}>
              Créer le lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
