import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { usePortalLeads, useCreatePortalLead, useUpdatePortalLeadStatus } from '../hooks/use-portal-leads'
import { Plus, Search, Filter, Calendar, LayoutGrid, List, Phone, X, ChevronDown, MoreVertical, Check } from 'lucide-react'
import { toast } from 'sonner'
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

export function PortalLeadsKanbanPage() {
  const { client } = usePortalAuth()
  const { data: leads, isLoading } = usePortalLeads(client?.id)
  const createLead = useCreatePortalLead()
  const updateStatus = useUpdatePortalLeadStatus()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropCol, setDropCol] = useState<string | null>(null)
  const [perduOpen, setPerduOpen] = useState(false)
  const [view, setView] = useState<'kanban' | 'list'>('kanban')

  // New lead form
  const [formData, setFormData] = useState({ name: '', phone: '', type: '', amount: '', source: 'lsa', notes: '' })

  const filtered = useMemo(() => {
    if (!leads) return []
    if (!search.trim()) return leads
    const q = search.toLowerCase()
    return leads.filter(l => l.name.toLowerCase().includes(q) || l.work_type.toLowerCase().includes(q))
  }, [leads, search])

  function onDrop(col: string) {
    if (!dragId) return
    const lead = leads?.find(l => l.id === dragId)
    if (!lead || lead.status === col) { setDragId(null); setDropCol(null); return }
    updateStatus.mutate({ id: dragId, newStatus: col, oldStatus: lead.status })
    setDragId(null)
    setDropCol(null)
  }

  function changeStatus(leadId: string, newStatus: string) {
    const lead = leads?.find(l => l.id === leadId)
    if (!lead || lead.status === newStatus) return
    updateStatus.mutate({ id: leadId, newStatus, oldStatus: lead.status })
  }

  function resetForm() { setFormData({ name: '', phone: '', type: '', amount: '', source: 'lsa', notes: '' }) }

  async function handleCreateLead() {
    if (!client || !formData.name || !formData.phone || !formData.type) { toast.error('Nom, téléphone et type requis'); return }
    await createLead.mutateAsync({
      client_id: client.id,
      name: formData.name,
      phone: formData.phone,
      work_type: formData.type,
      amount_estimated: formData.amount ? parseFloat(formData.amount) : undefined,
      source: formData.source as 'lsa' | 'bao',
      notes: formData.notes || undefined,
    })
    resetForm()
    setShowModal(false)
  }

  if (isLoading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Chargement...</div>

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="font-display" style={{ fontSize: 26, fontWeight: 700 }}>Leads</h1>
          <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>{filtered.length} leads · {(leads ?? []).filter(l => l.status === 'nouveau').length} nouveaux</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Nouveau lead</button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-5">
        <div className="relative w-full sm:flex-1 sm:max-w-xs">
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none' }}><Search size={16} /></span>
          <input
            className="input w-full"
            placeholder="Rechercher un lead…"
            style={{ paddingLeft: 38, fontSize: 16 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <button className="btn btn-secondary"><Filter size={14} /> Filtres</button>
          <button className="btn btn-secondary"><Calendar size={14} /> Ce mois</button>
          <div style={{ display: 'flex', background: 'var(--gray-100)', borderRadius: 8, padding: 3 }}>
            <button
              onClick={() => setView('kanban')}
              className="btn"
              aria-label="Vue Kanban"
              style={{ padding: '6px 12px', fontSize: 13, background: view === 'kanban' ? 'white' : 'transparent', color: view === 'kanban' ? 'var(--violet-700)' : 'var(--gray-600)', boxShadow: view === 'kanban' ? 'var(--shadow-btn)' : 'none' }}
            >
              <LayoutGrid size={14} /> Kanban
            </button>
            <button
              onClick={() => setView('list')}
              className="btn"
              aria-label="Vue Liste"
              style={{ padding: '6px 12px', fontSize: 13, background: view === 'list' ? 'white' : 'transparent', color: view === 'list' ? 'var(--violet-700)' : 'var(--gray-600)', boxShadow: view === 'list' ? 'var(--shadow-btn)' : 'none' }}
            >
              <List size={14} /> Liste
            </button>
          </div>
        </div>
      </div>

      {/* Kanban view */}
      {view === 'kanban' ? (
        <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 12 }}>
          {COLS.map(col => {
            const colLeads = filtered.filter(l => l.status === col)
            const collapsed = col === 'perdu' && !perduOpen
            const m = { ...PORTAL_LEAD_STATUS_VAR_COLORS[col], label: PORTAL_LEAD_STATUS_LABELS[col] }
            return (
              <div
                key={col}
                className={dropCol === col ? 'kanban-col drop-target' : 'kanban-col'}
                onDragOver={e => { e.preventDefault(); setDropCol(col) }}
                onDragLeave={() => setDropCol(null)}
                onDrop={() => onDrop(col)}
                style={{ flex: collapsed ? '0 0 72px' : '0 0 280px', opacity: col === 'perdu' ? 0.85 : 1, maxHeight: 'calc(100vh - 220px)' }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 10px', cursor: col === 'perdu' ? 'pointer' : 'default' }}
                  onClick={() => col === 'perdu' && setPerduOpen(o => !o)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color }} />
                    {!collapsed && <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-700)' }}>{m.label}</span>}
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', background: 'white', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--gray-200)' }}>{colLeads.length}</span>
                  </div>
                  {col === 'perdu' && <ChevronDown size={14} />}
                </div>
                {!collapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', padding: 4 }}>
                    {colLeads.map(lead => (
                      <div
                        key={lead.id}
                        className={`kanban-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 ${dragId === lead.id ? 'dragging' : ''}`}
                        draggable
                        tabIndex={0}
                        role="button"
                        aria-label={`Lead ${lead.name} — ${lead.work_type}`}
                        onDragStart={() => setDragId(lead.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => navigate(`/portal/leads/${lead.id}`)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            navigate(`/portal/leads/${lead.id}`)
                          }
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-900)', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            {lead.is_urgent && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626', flexShrink: 0, marginTop: 5, boxShadow: '0 0 0 3px rgba(220,38,38,0.15)' }} />}
                            <StatusChangeMenu
                              currentStatus={lead.status}
                              leadName={lead.name}
                              onChange={newStatus => changeStatus(lead.id, newStatus)}
                            />
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--gray-600)', marginBottom: 8, lineHeight: 1.45 }}>{lead.work_type}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray-500)', marginBottom: 8 }}>
                          <Phone size={12} />{lead.phone}
                        </div>
                        {lead.amount_estimated && (
                          <div className="font-display" style={{ fontSize: 15, fontWeight: 700, color: col === 'signe' ? 'var(--emerald-600)' : 'var(--gray-900)', marginBottom: 8 }}>
                            {lead.amount_estimated.toLocaleString('fr-FR')} €
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className={`p-tag ${lead.source === 'lsa' ? 'p-tag-violet' : ''}`} style={{ fontSize: 10, padding: '2px 7px', background: lead.source === 'lsa' ? 'var(--blue-100)' : 'var(--gray-100)', color: lead.source === 'lsa' ? 'var(--blue-600)' : 'var(--gray-600)', border: 'none' }}>
                            {lead.source === 'lsa' ? 'Google Ads' : 'BAO'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {colLeads.length === 0 && (
                      <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--gray-400)', border: '1px dashed var(--gray-200)', borderRadius: 8 }}>Déposer un lead ici</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
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
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 600, background: l.source === 'lsa' ? 'var(--blue-100)' : 'var(--gray-100)', color: l.source === 'lsa' ? 'var(--blue-600)' : 'var(--gray-600)' }}>{l.source === 'lsa' ? 'Google Ads' : 'BAO'}</span>
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
                <div><label className="label-input">Téléphone *</label><input className="input" type="tel" value={formData.phone} onChange={e => setFormData(d => ({ ...d, phone: e.target.value }))} placeholder="06 XX XX XX XX" style={{ fontSize: 16 }} /></div>
                <div><label className="label-input">Type de travaux *</label><input className="input" value={formData.type} onChange={e => setFormData(d => ({ ...d, type: e.target.value }))} placeholder="Ex : Rénovation piscine 8×4" style={{ fontSize: 16 }} /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="label-input">Montant estimé (€)</label><input className="input" type="number" inputMode="numeric" value={formData.amount} onChange={e => setFormData(d => ({ ...d, amount: e.target.value }))} placeholder="Optionnel" style={{ fontSize: 16 }} /></div>
                  <div><label className="label-input">Source</label>
                    <select className="input" value={formData.source} onChange={e => setFormData(d => ({ ...d, source: e.target.value }))} style={{ fontSize: 16 }}>
                      <option value="lsa">Google Ads</option>
                      <option value="bao">Bouche-à-oreille</option>
                    </select>
                  </div>
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
