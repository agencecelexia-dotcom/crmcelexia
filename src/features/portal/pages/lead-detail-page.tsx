import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePortalLead, usePortalLeadEvents, useUpdatePortalLeadStatus, useUpdatePortalLead, useDeletePortalLead } from '../hooks/use-portal-leads'
import { ArrowLeft, Phone, MapPin, Calendar, CheckCircle2, Trash2, MoreHorizontal, RefreshCcw, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/format'

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  nouveau: { label: 'Nouveau', color: 'var(--blue-600)', bg: 'var(--blue-100)' },
  qualifie: { label: 'Qualifié', color: 'var(--violet-700)', bg: 'var(--violet-100)' },
  devis: { label: 'Devis envoyé', color: 'var(--amber-600)', bg: 'var(--amber-100)' },
  signe: { label: 'Signé', color: 'var(--emerald-600)', bg: 'var(--emerald-100)' },
  perdu: { label: 'Perdu', color: 'var(--gray-500)', bg: 'var(--gray-100)' },
}

export function PortalLeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: lead, isLoading } = usePortalLead(id)
  const { data: events } = usePortalLeadEvents(id)
  const updateStatus = useUpdatePortalLeadStatus()
  const updateLead = useUpdatePortalLead()
  const deleteLead = useDeletePortalLead()

  const [notes, setNotes] = useState<string | null>(null)
  const [signAmount, setSignAmount] = useState('')
  const [signDate, setSignDate] = useState(new Date().toISOString().split('T')[0])
  const [confirming, setConfirming] = useState(false)

  if (isLoading || !lead) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Chargement...</div>

  const m = STATUS_META[lead.status] || STATUS_META.nouveau
  const currentNotes = notes ?? lead.notes ?? ''
  const commission = signAmount ? (Number(signAmount) * 0.1).toLocaleString('fr-FR') : '—'

  async function saveNotes() {
    if (notes === null || notes === lead?.notes) return
    await updateLead.mutateAsync({ id: lead!.id, updates: { notes } })
    toast.success('Notes sauvegardées')
  }

  async function handleSign() {
    const amount = parseFloat(signAmount)
    if (!amount || amount <= 0) { toast.error('Montant invalide'); return }
    setConfirming(true)
    try {
      await updateStatus.mutateAsync({ id: lead!.id, newStatus: 'signe', oldStatus: lead!.status, extra: { signed_amount: amount, signed_at: signDate } })
      toast.success('Lead marqué comme signé !')
    } finally { setConfirming(false) }
  }

  async function handleDelete() {
    if (!confirm('Supprimer ce lead ?')) return
    await deleteLead.mutateAsync(lead!.id)
    navigate('/portal/leads')
  }

  return (
    <div>
      {/* Back button */}
      <button className="btn btn-ghost" onClick={() => navigate('/portal/leads')} style={{ marginBottom: 16, padding: '6px 10px', fontSize: 13 }}>
        <ArrowLeft size={14} /> Retour aux leads
      </button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <h1 className="font-display" style={{ fontSize: 26, fontWeight: 700 }}>{lead.name}</h1>
            <span className="p-tag" style={{ background: m.bg, color: m.color, border: 'none' }}>{m.label}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 13, color: 'var(--gray-500)', flexWrap: 'wrap' }}>
            {lead.city && <span>{lead.city}</span>}
            <span>·</span>
            <span>{lead.work_type}</span>
            <span>·</span>
            <span>Créé le {formatDate(lead.created_at)}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 24 }}>
        {/* Left column */}
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Contact */}
          <div className="p-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-900)', marginBottom: 14 }}>Coordonnées</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--gray-700)' }}>
                <Phone size={16} style={{ color: 'var(--gray-400)' }} />
                <a href={`tel:${lead.phone}`} style={{ color: 'var(--violet-600)', fontWeight: 500, textDecoration: 'none' }}>{lead.phone}</a>
              </div>
              {lead.city && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--gray-700)' }}>
                  <MapPin size={16} style={{ color: 'var(--gray-400)' }} /> {lead.city}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--gray-700)' }}>
                <Calendar size={16} style={{ color: 'var(--gray-400)' }} /> Créé le {formatDate(lead.created_at)}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="p-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-900)' }}>Notes</h3>
              {notes !== null && notes !== lead.notes && <span style={{ fontSize: 11, color: 'var(--violet-600)' }}>Modifié</span>}
            </div>
            <textarea
              className="input"
              value={currentNotes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Ajouter des notes..."
              style={{ minHeight: 100, resize: 'vertical', lineHeight: 1.55 }}
            />
          </div>

          {/* Timeline */}
          <div className="p-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-900)', marginBottom: 14 }}>Historique</h3>
            {events && events.length > 0 ? (
              <div className="timeline">
                {events.map(ev => (
                  <div className="timeline-item" key={ev.id}>
                    <div className="timeline-dot done">
                      <CheckCircle2 size={10} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 2 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--gray-900)' }}>{ev.description}</div>
                      <div style={{ fontSize: 12, color: 'var(--gray-500)', flexShrink: 0 }}>{formatDate(ev.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--gray-400)', textAlign: 'center', padding: '16px 0' }}>Aucun événement</p>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          {/* Sign card */}
          {lead.status !== 'signe' && lead.status !== 'perdu' && (
            <div className="p-card" style={{ padding: 20, border: '1.5px solid var(--violet-200)', background: 'rgba(124,58,237,0.02)' }}>
              <h3 className="font-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-900)', marginBottom: 14 }}>
                Marquer comme signé
              </h3>
              <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
                <div>
                  <label className="label-input">Montant du devis (€ HT) *</label>
                  <input className="input" type="number" value={signAmount} onChange={e => setSignAmount(e.target.value)} placeholder="5 000" />
                </div>
                <div>
                  <label className="label-input">Date de signature</label>
                  <input className="input" type="date" value={signDate} onChange={e => setSignDate(e.target.value)} />
                </div>
              </div>
              {signAmount && Number(signAmount) > 0 && (
                <div style={{ padding: 14, background: 'var(--violet-50)', borderRadius: 'var(--radius-md)', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: 'var(--gray-600)' }}>Commission Celexia (10%)</div>
                  <div className="font-display" style={{ fontSize: 20, fontWeight: 700, color: 'var(--violet-700)' }}>{commission} €</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>Facturée le 1<sup>er</sup> du mois suivant</div>
                </div>
              )}
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={!signAmount || Number(signAmount) <= 0 || confirming} onClick={handleSign}>
                <CheckCircle2 size={16} /> {confirming ? 'Enregistrement...' : 'Confirmer la signature'}
              </button>
            </div>
          )}

          {/* Signed info */}
          {lead.status === 'signe' && lead.signed_amount && (
            <div className="p-card" style={{ padding: 20, background: 'var(--emerald-100)', border: '1px solid var(--emerald-500)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <CheckCircle2 size={18} style={{ color: 'var(--emerald-600)' }} />
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--emerald-600)' }}>Devis signé</h3>
              </div>
              <div className="font-display" style={{ fontSize: 28, fontWeight: 700, color: 'var(--emerald-600)', marginBottom: 4 }}>
                {lead.signed_amount.toLocaleString('fr-FR')} € HT
              </div>
              {lead.signed_at && <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>Signé le {lead.signed_at}</div>}
              <div style={{ borderTop: '1px solid rgba(5,150,105,0.2)', marginTop: 12, paddingTop: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>Commission (10%)</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--violet-700)' }}>{(lead.signed_amount * 0.10).toLocaleString('fr-FR')} €</div>
              </div>
            </div>
          )}

          {/* Delete */}
          <button className="btn" style={{ width: '100%', background: 'white', color: '#DC2626', border: '1.5px solid #FECACA', padding: '10px 18px', fontSize: 14, fontWeight: 600 }} onClick={handleDelete}>
            <Trash2 size={16} /> Supprimer ce lead
          </button>
        </div>
      </div>
    </div>
  )
}
