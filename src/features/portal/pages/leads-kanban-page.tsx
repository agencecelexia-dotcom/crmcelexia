import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { usePortalLeads, useCreatePortalLead, useUpdatePortalLeadStatus } from '../hooks/use-portal-leads'
import { Plus, Search, LayoutGrid, List, Phone, X, ChevronDown, MoreVertical, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useEscClose } from '../lib/use-esc-close'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  PORTAL_LEAD_STATUS_LABELS,
  PORTAL_LEAD_STATUS_VAR_COLORS,
  PORTAL_LEAD_STATUS_ORDER,
  type PortalLeadStatus,
} from '@/types/enums'
import type { PortalLead } from '@/types'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'

const COLS: PortalLeadStatus[] = PORTAL_LEAD_STATUS_ORDER

type StatusChangeMenuProps = {
  currentStatus: string
  onChange: (newStatus: string) => void
  leadName: string
}

function StatusChangeMenu({ currentStatus, onChange, leadName }: StatusChangeMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Changer le statut de ${leadName}`}
          onClick={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            minWidth: 32,
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: 'var(--gray-500)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <MoreVertical size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[200px]"
        onClick={e => e.stopPropagation()}
      >
        <DropdownMenuLabel>Changer le statut</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PORTAL_LEAD_STATUS_ORDER.map(s => {
          const isCurrent = s === currentStatus
          return (
            <DropdownMenuItem
              key={s}
              onSelect={() => {
                if (!isCurrent) onChange(s)
              }}
              className="min-h-10 sm:min-h-9"
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: PORTAL_LEAD_STATUS_VAR_COLORS[s].color,
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1 }}>{PORTAL_LEAD_STATUS_LABELS[s]}</span>
              {isCurrent && <Check size={14} style={{ color: 'var(--violet-600)' }} />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KanbanColumn — receveur de drop via useDroppable
// ─────────────────────────────────────────────────────────────────────────────

type KanbanColumnProps = {
  col: PortalLeadStatus
  isOver: boolean
  collapsed: boolean
  label: string
  color: string
  count: number
  isPerdu: boolean
  perduOpen: boolean
  togglePerdu: () => void
  children: React.ReactNode
}

function KanbanColumn({ col, isOver, collapsed, label, color, count, isPerdu, togglePerdu, children }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id: col })
  return (
    <div
      ref={setNodeRef}
      className={isOver ? 'kanban-col drop-target' : 'kanban-col'}
      style={{ flex: collapsed ? '0 0 72px' : '0 0 280px', opacity: isPerdu ? 0.85 : 1, maxHeight: 'calc(100vh - 220px)' }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 10px', cursor: isPerdu ? 'pointer' : 'default' }}
        onClick={() => isPerdu && togglePerdu()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
          {!collapsed && <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-700)' }}>{label}</span>}
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', background: 'white', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--gray-200)' }}>{count}</span>
        </div>
        {isPerdu && <ChevronDown size={14} />}
      </div>
      {!collapsed && children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KanbanCard — élément draggable via useDraggable
// ─────────────────────────────────────────────────────────────────────────────

type KanbanCardProps = {
  lead: PortalLead
  onChangeStatus: (newStatus: string) => void
  onOpen: () => void
}

function KanbanCard({ lead, onChangeStatus, onOpen }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    data: { status: lead.status },
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`kanban-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 ${isDragging ? 'dragging' : ''}`}
      role="button"
      aria-label={`Lead ${lead.name} — ${lead.work_type}`}
      onClick={(e) => {
        if (isDragging) return
        // Ne pas ouvrir si on a clické dans le menu Status (les enfants stopPropagation)
        if ((e.target as HTMLElement).closest('[role="menu"]')) return
        onOpen()
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div
          className="truncate"
          style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-900)', minWidth: 0, flex: 1, wordBreak: 'normal', overflowWrap: 'normal' }}
          title={lead.name}
        >{lead.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {lead.is_urgent && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626', flexShrink: 0, marginTop: 5, boxShadow: '0 0 0 3px rgba(220,38,38,0.15)' }} />}
          <StatusChangeMenu
            currentStatus={lead.status}
            leadName={lead.name}
            onChange={onChangeStatus}
          />
        </div>
      </div>
      <div
        className="line-clamp-2"
        style={{ fontSize: 12, color: 'var(--gray-600)', marginBottom: 8, lineHeight: 1.45, wordBreak: 'normal', overflowWrap: 'normal' }}
        title={lead.work_type}
      >{lead.work_type}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray-500)', marginBottom: 8 }}>
        <Phone size={12} />{lead.phone}
      </div>
      {lead.amount_estimated && (
        <div className="font-display" style={{ fontSize: 15, fontWeight: 700, color: lead.status === 'signe' ? 'var(--emerald-600)' : 'var(--gray-900)', marginBottom: 8 }}>
          {lead.amount_estimated.toLocaleString('fr-FR')} €
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className={`p-tag ${lead.source === 'lsa' ? 'p-tag-violet' : ''}`} style={{ fontSize: 10, padding: '2px 7px', background: lead.source === 'lsa' ? 'var(--blue-100)' : 'var(--gray-100)', color: lead.source === 'lsa' ? 'var(--blue-600)' : 'var(--gray-600)', border: 'none' }}>
          {lead.source === 'lsa' ? 'Celexia' : 'Bouche-à-oreille'}
        </span>
      </div>
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
  const [showModal, setShowModal] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [perduOpen, setPerduOpen] = useState(false)
  const [view, setView] = useState<'kanban' | 'list'>('kanban')

  // Sensors @dnd-kit — supportent souris, tactile et clavier (a11y).
  // PointerSensor activation distance 8px = on évite de déclencher le drag
  // au moindre tap. TouchSensor delay 200ms = on distingue scroll vertical
  // mobile et drag intentionnel.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  )

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    setOverCol(null)
    const draggedId = String(e.active.id)
    const overId = e.over?.id ? String(e.over.id) : null
    if (!overId) return
    const lead = leads?.find(l => l.id === draggedId)
    if (!lead || lead.status === overId) return
    updateStatus.mutate({ id: draggedId, newStatus: overId, oldStatus: lead.status })
  }

  // New lead form
  // Source forcée à 'bao' : un lead créé manuellement par l'artisan est
  // toujours du bouche-à-oreille. Les LSA sont créés par Celexia uniquement.
  const [formData, setFormData] = useState({
    name: '', phone: '', email: '', type: '', amount: '',
    address: '', postal_code: '', city: '',
    source: 'bao', notes: '',
  })

  const filtered = useMemo(() => {
    if (!leads) return []
    if (!search.trim()) return leads
    const q = search.toLowerCase()
    return leads.filter(l => l.name.toLowerCase().includes(q) || l.work_type.toLowerCase().includes(q))
  }, [leads, search])

  function changeStatus(leadId: string, newStatus: string) {
    const lead = leads?.find(l => l.id === leadId)
    if (!lead || lead.status === newStatus) return
    updateStatus.mutate({ id: leadId, newStatus, oldStatus: lead.status })
  }

  function resetForm() {
    setFormData({
      name: '', phone: '', email: '', type: '', amount: '',
      address: '', postal_code: '', city: '',
      source: 'bao', notes: '',
    })
  }

  async function handleCreateLead() {
    if (!client || !formData.name || !formData.phone || !formData.type) { toast.error('Nom, téléphone et type requis'); return }
    await createLead.mutateAsync({
      client_id: client.id,
      name: formData.name,
      phone: formData.phone,
      work_type: formData.type,
      email: formData.email || undefined,
      address: formData.address || undefined,
      postal_code: formData.postal_code || undefined,
      city: formData.city || undefined,
      amount_estimated: formData.amount ? parseFloat(formData.amount) : undefined,
      source: formData.source as 'lsa' | 'bao',
      notes: formData.notes || undefined,
    })
    resetForm()
    setShowModal(false)
  }

  useEscClose(showModal, () => { setShowModal(false); resetForm() })

  // Skeleton kanban pendant le fetch — évite le full-screen spinner qui faisait
  // sauter le layout (bug audit Cowork M2). On rend header + 5 colonnes
  // squelettes pour signaler "ça charge mais ça vient".
  if (isLoading) {
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 sm:mb-5">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-bold sm:text-2xl md:text-[26px]">Leads</h1>
            <div className="mt-1 h-3 w-32 rounded bg-[var(--gray-100)] animate-pulse" />
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2" aria-busy="true" aria-label="Chargement des leads">
          {[0, 1, 2, 3, 4].map((col) => (
            <div key={col} className="shrink-0 w-[260px]">
              <div className="mb-2 flex items-center justify-between">
                <div className="h-4 w-20 rounded bg-[var(--gray-200)] animate-pulse" />
                <div className="h-4 w-6 rounded bg-[var(--gray-100)] animate-pulse" />
              </div>
              <div className="space-y-2">
                {[0, 1, 2].map((card) => (
                  <div key={card} className="rounded-lg bg-white border border-[var(--gray-100)] p-3">
                    <div className="h-3 w-3/4 rounded bg-[var(--gray-100)] animate-pulse mb-2" />
                    <div className="h-3 w-1/2 rounded bg-[var(--gray-100)] animate-pulse mb-3" />
                    <div className="h-2 w-1/3 rounded bg-[var(--gray-100)] animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 sm:mb-5 sm:gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-bold sm:text-2xl md:text-[26px]">Leads</h1>
          <p className="mt-0.5 text-xs text-[var(--gray-500)] sm:text-[13px]">
            {filtered.length} leads · {(leads ?? []).filter(l => l.status === 'nouveau').length} nouveaux
          </p>
        </div>
        <button
          className="btn btn-primary flex-shrink-0"
          onClick={() => setShowModal(true)}
          style={{ padding: '8px 14px', fontSize: 13 }}
        >
          <Plus size={16} /> <span className="hidden sm:inline">Nouveau lead</span><span className="sm:hidden">Nouveau</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-5">
        <div className="relative w-full sm:flex-1 sm:max-w-xs">
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none' }}><Search size={16} /></span>
          <input
            className="input w-full"
            type="search"
            placeholder="Rechercher un lead…"
            aria-label="Rechercher un lead"
            style={{ paddingLeft: 38, fontSize: 16 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <div role="group" aria-label="Choix du mode d'affichage" style={{ display: 'flex', background: 'var(--gray-100)', borderRadius: 8, padding: 3 }}>
            <button
              onClick={() => setView('kanban')}
              className="btn"
              aria-label="Vue Kanban"
              aria-pressed={view === 'kanban'}
              style={{ padding: '6px 12px', fontSize: 13, background: view === 'kanban' ? 'white' : 'transparent', color: view === 'kanban' ? 'var(--violet-700)' : 'var(--gray-600)', boxShadow: view === 'kanban' ? 'var(--shadow-btn)' : 'none' }}
            >
              <LayoutGrid size={14} /> Kanban
            </button>
            <button
              onClick={() => setView('list')}
              className="btn"
              aria-label="Vue Liste"
              aria-pressed={view === 'list'}
              style={{ padding: '6px 12px', fontSize: 13, background: view === 'list' ? 'white' : 'transparent', color: view === 'list' ? 'var(--violet-700)' : 'var(--gray-600)', boxShadow: view === 'list' ? 'var(--shadow-btn)' : 'none' }}
            >
              <List size={14} /> Liste
            </button>
          </div>
        </div>
      </div>

      {/* Kanban view — @dnd-kit (souris + tactile + clavier). Le DragOverlay
          rend la card pendant le drag avec un offset propre. */}
      {view === 'kanban' ? (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={(e) => setOverCol(e.over?.id ? String(e.over.id) : null)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => { setActiveId(null); setOverCol(null) }}
        >
          <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 12 }}>
            {COLS.map(col => {
              const colLeads = filtered.filter(l => l.status === col)
              const collapsed = col === 'perdu' && !perduOpen
              const m = { ...PORTAL_LEAD_STATUS_VAR_COLORS[col], label: PORTAL_LEAD_STATUS_LABELS[col] }
              return (
                <KanbanColumn
                  key={col}
                  col={col}
                  isOver={overCol === col}
                  collapsed={collapsed}
                  label={m.label}
                  color={m.color}
                  count={colLeads.length}
                  isPerdu={col === 'perdu'}
                  perduOpen={perduOpen}
                  togglePerdu={() => setPerduOpen(o => !o)}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', padding: 4 }}>
                    {colLeads.map(lead => (
                      <KanbanCard
                        key={lead.id}
                        lead={lead}
                        onChangeStatus={(s) => changeStatus(lead.id, s)}
                        onOpen={() => navigate(`/portal/leads/${lead.id}`)}
                      />
                    ))}
                    {colLeads.length === 0 && (
                      <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--gray-400)', border: '1px dashed var(--gray-200)', borderRadius: 8 }}>Déposer un lead ici</div>
                    )}
                  </div>
                </KanbanColumn>
              )
            })}
          </div>
          <DragOverlay>
            {activeId ? (
              (() => {
                const lead = leads?.find(l => l.id === activeId)
                if (!lead) return null
                return (
                  <div className="kanban-card" style={{ width: 260, cursor: 'grabbing', opacity: 0.95, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-900)', marginBottom: 6 }}>{lead.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>{lead.work_type}</div>
                  </div>
                )
              })()
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        /* List view */
        <div className="p-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="overflow-x-auto -mx-px">
            <table className="min-w-[640px]" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  {['Prospect', 'Travaux', 'Montant', 'Source', 'Statut', ''].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-500)', borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => (
                  <tr key={l.id} onClick={() => navigate(`/portal/leads/${l.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--gray-100)' }}>
                      <strong style={{ color: 'var(--gray-900)' }}>{l.name}</strong>
                      <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{l.phone}</div>
                    </td>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--gray-100)', color: 'var(--gray-700)' }}>{l.work_type}</td>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--gray-100)', color: 'var(--gray-700)' }}>{l.amount_estimated ? l.amount_estimated.toLocaleString('fr-FR') + ' €' : '—'}</td>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--gray-100)' }}>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 600, background: l.source === 'lsa' ? 'var(--blue-100)' : 'var(--gray-100)', color: l.source === 'lsa' ? 'var(--blue-600)' : 'var(--gray-600)' }}>{l.source === 'lsa' ? 'Celexia' : 'Bouche-à-oreille'}</span>
                    </td>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--gray-100)' }}>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 600, background: PORTAL_LEAD_STATUS_VAR_COLORS[l.status]?.bg, color: PORTAL_LEAD_STATUS_VAR_COLORS[l.status]?.color }}>{PORTAL_LEAD_STATUS_LABELS[l.status]}</span>
                    </td>
                    <td
                      style={{ padding: '8px 12px', borderBottom: '1px solid var(--gray-100)', width: 48 }}
                      onClick={e => e.stopPropagation()}
                    >
                      <StatusChangeMenu
                        currentStatus={l.status}
                        leadName={l.name}
                        onChange={newStatus => changeStatus(l.id, newStatus)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New lead modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20, backdropFilter: 'blur(2px)' }} onClick={() => { setShowModal(false); resetForm() }}>
          <div
            className="flex flex-col max-h-[90vh] w-full max-w-[520px]"
            style={{ background: 'white', borderRadius: 'var(--radius-xl)', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 p-5 sm:p-6">
              <h2 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Nouveau lead</h2>
              <button className="btn btn-ghost" onClick={() => { setShowModal(false); resetForm() }} style={{ padding: 8 }}><X size={18} /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6">
              <div className="grid gap-3.5">
                <div><label className="label-input">Nom du prospect *</label><input className="input" value={formData.name} onChange={e => setFormData(d => ({ ...d, name: e.target.value }))} placeholder="Ex : Martin Dupont" style={{ fontSize: 16 }} /></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div><label className="label-input">Téléphone *</label><input className="input" type="tel" value={formData.phone} onChange={e => setFormData(d => ({ ...d, phone: e.target.value }))} placeholder="06 XX XX XX XX" style={{ fontSize: 16 }} /></div>
                  <div><label className="label-input">Email</label><input className="input" type="email" value={formData.email} onChange={e => setFormData(d => ({ ...d, email: e.target.value }))} placeholder="contact@…" style={{ fontSize: 16 }} /></div>
                </div>
                <div><label className="label-input">Type de travaux *</label><input className="input" value={formData.type} onChange={e => setFormData(d => ({ ...d, type: e.target.value }))} placeholder="Ex : Rénovation piscine 8×4" style={{ fontSize: 16 }} /></div>
                <div><label className="label-input">Adresse du chantier</label><input className="input" value={formData.address} onChange={e => setFormData(d => ({ ...d, address: e.target.value }))} placeholder="12 rue des Lilas" style={{ fontSize: 16 }} /></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
                  <div><label className="label-input">Code postal</label><input className="input" value={formData.postal_code} onChange={e => setFormData(d => ({ ...d, postal_code: e.target.value }))} placeholder="34000" style={{ fontSize: 16 }} /></div>
                  <div><label className="label-input">Ville</label><input className="input" value={formData.city} onChange={e => setFormData(d => ({ ...d, city: e.target.value }))} placeholder="Montpellier" style={{ fontSize: 16 }} /></div>
                </div>
                <div>
                  <label className="label-input">Montant estimé (€)</label>
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    value={formData.amount}
                    onChange={e => setFormData(d => ({ ...d, amount: e.target.value }))}
                    placeholder="Optionnel"
                    style={{ fontSize: 16 }}
                  />
                </div>
                <div className="rounded-[var(--radius-md)] border border-violet-100 bg-violet-50 p-2.5 text-[11px] leading-relaxed text-violet-800">
                  Ce lead sera enregistré comme <strong>bouche-à-oreille</strong>. Les leads envoyés par Celexia apparaissent automatiquement dans votre tableau.
                </div>
                <div><label className="label-input">Notes</label><textarea className="input" value={formData.notes} onChange={e => setFormData(d => ({ ...d, notes: e.target.value }))} placeholder="Contexte, besoins particuliers…" style={{ minHeight: 80, resize: 'vertical', fontSize: 16 }} /></div>
              </div>
            </div>
            <div
              className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-100 p-4 sm:flex-row sm:justify-end sm:gap-2.5 sm:p-4"
              style={{ background: 'var(--gray-50)', borderRadius: '0 0 var(--radius-xl) var(--radius-xl)' }}
            >
              <button className="btn btn-ghost w-full sm:w-auto" onClick={() => { setShowModal(false); resetForm() }}>Annuler</button>
              <button className="btn btn-primary w-full sm:w-auto" disabled={!formData.name || !formData.phone || !formData.type || createLead.isPending} onClick={handleCreateLead}>Créer le lead</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
