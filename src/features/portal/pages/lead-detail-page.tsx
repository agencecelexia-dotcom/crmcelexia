import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { usePortalLead, usePortalLeadEvents, useUpdatePortalLead, useDeletePortalLead, useMarkPortalLeadSigned } from '../hooks/use-portal-leads'
import { useLeadInvoices } from '../hooks/use-lead-invoices'
import { ArrowLeft, Phone, MapPin, Calendar, CheckCircle2, Trash2, FileText, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { formatDate, formatDateTime } from '@/lib/format'
import { LeadInvoicesSection } from '../components/lead-invoices-section'
import { ProjectTimeline } from '../components/project-timeline/project-timeline'
import { getCommissionTerms, formatCommissionTerms, calcCommission } from '../lib/format'
import type { Quote } from '@/types'
import {
  PORTAL_LEAD_STATUS_LABELS,
  PORTAL_LEAD_STATUS_VAR_COLORS,
  type PortalLeadStatus,
} from '@/types/enums'

// Remplace les valeurs brutes d'enum dans les descriptions d'événements
// par leurs libellés UI (ex: "qualifie" → "Qualifié"). Évite les fuites
// de noms internes dans le timeline (audit V2 m3).
function humanizeEventDescription(desc: string): string {
  const statuses: PortalLeadStatus[] = ['nouveau', 'qualifie', 'devis', 'signe', 'perdu']
  let out = desc
  for (const s of statuses) {
    const label = PORTAL_LEAD_STATUS_LABELS[s]
    // Match 'qualifie', "qualifie", or barewords surrounded by spaces/punctuation
    out = out.replace(new RegExp(`['"]${s}['"]`, 'g'), `« ${label} »`)
  }
  return out
}
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export function PortalLeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { client } = usePortalAuth()
  const { data: lead, isLoading } = usePortalLead(id)
  const { data: events } = usePortalLeadEvents(id)
  const markSigned = useMarkPortalLeadSigned()
  const updateLead = useUpdatePortalLead()
  const deleteLead = useDeletePortalLead()

  const [notes, setNotes] = useState<string | null>(null)
  const [signAmount, setSignAmount] = useState('')
  // Pré-remplit le montant signé avec l'estimation faite à la création.
  // L'artisan peut toujours surcharger si le devis final diffère.
  useEffect(() => {
    if (lead?.amount_estimated && !signAmount) {
      setSignAmount(String(lead.amount_estimated))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.amount_estimated])
  const [signDate, setSignDate] = useState(new Date().toISOString().split('T')[0])
  const [confirming, setConfirming] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Dernier devis signé lié à ce lead (pour afficher un bouton "Voir le devis").
  const { data: signedQuote } = useQuery({
    queryKey: ['lead-signed-quote', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, quote_number')
        .eq('portal_lead_id', id!)
        .eq('status', 'signed')
        .is('deleted_at', null)
        .order('signed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) return null
      return data
    },
    enabled: !!id && lead?.status === 'signe',
  })

  // Tous les devis liés au lead (pour la timeline projet, audit V3).
  // On charge tout — natifs + externes, signés ou non — pour que la timeline
  // ait toutes les sources de vérité dispo.
  const { data: leadQuotes } = useQuery({
    queryKey: ['lead-quotes', id],
    queryFn: async (): Promise<Quote[]> => {
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('portal_lead_id', id!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) return []
      return (data ?? []) as Quote[]
    },
    enabled: !!id,
  })

  // Factures chantier (timeline + section existante)
  const { data: leadInvoices } = useLeadInvoices(id)

  if (isLoading || !lead) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Chargement...</div>

  const statusColors = PORTAL_LEAD_STATUS_VAR_COLORS[lead.status] || PORTAL_LEAD_STATUS_VAR_COLORS.nouveau
  const statusLabel = PORTAL_LEAD_STATUS_LABELS[lead.status] || PORTAL_LEAD_STATUS_LABELS.nouveau
  const currentNotes = notes ?? lead.notes ?? ''
  const terms = getCommissionTerms(client)
  const termsLabel = formatCommissionTerms(terms)
  const commission = signAmount ? calcCommission(Number(signAmount), terms).toLocaleString('fr-FR') : '—'

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
      // Passe par la RPC mark_portal_lead_signed (00098) — l'UPDATE
      // direct sur status='signe' donnait 403 RLS opaque (audit Cowork).
      await markSigned.mutateAsync({ leadId: lead!.id, amount, signedAt: signDate })
      toast.success('Lead marqué comme signé !')
    } finally { setConfirming(false) }
  }

  async function handleDelete() {
    setDeleteOpen(false)
    try {
      await deleteLead.mutateAsync(lead!.id)
      toast.success('Lead archivé')
      navigate('/portal/leads')
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  return (
    <div>
      {/* Back button */}
      <button
        className="btn btn-ghost mb-3 sm:mb-4"
        onClick={() => navigate('/portal/leads')}
        style={{ padding: '6px 10px', fontSize: 13 }}
      >
        <ArrowLeft size={14} /> Retour
      </button>

      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-xl font-bold leading-tight sm:text-2xl md:text-[26px]">{lead.name}</h1>
          <span className="p-tag" style={{ background: statusColors.bg, color: statusColors.color, border: 'none' }}>{statusLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--gray-500)] sm:text-[13px]">
          {lead.city && <><span>{lead.city}</span><span>·</span></>}
          <span>{lead.work_type}</span>
          <span>·</span>
          <span>Créé le {formatDate(lead.created_at)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-4 md:gap-6">
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
              <a
                href={`tel:${lead.phone}`}
                aria-label={`Appeler ${lead.name} au ${lead.phone}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  height: 44,
                  minHeight: 44,
                  padding: '0 16px',
                  borderRadius: 10,
                  background: 'var(--violet-600)',
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: 'var(--shadow-btn)',
                  width: '100%',
                }}
              >
                <Phone size={16} /> Appeler
              </a>
              {lead.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--gray-700)' }}>
                  <Mail size={16} style={{ color: 'var(--gray-400)' }} />
                  <a href={`mailto:${lead.email}`} style={{ color: 'var(--violet-600)', textDecoration: 'none' }}>
                    {lead.email}
                  </a>
                </div>
              )}
              {(lead.address || lead.postal_code || lead.city) && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: 'var(--gray-700)' }}>
                  <MapPin size={16} style={{ color: 'var(--gray-400)', marginTop: 2 }} />
                  <div>
                    {lead.address && <div>{lead.address}</div>}
                    {(lead.postal_code || lead.city) && (
                      <div>{[lead.postal_code, lead.city].filter(Boolean).join(' ')}</div>
                    )}
                  </div>
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
              style={{ minHeight: 100, resize: 'vertical', lineHeight: 1.55, fontSize: 16 }}
            />
          </div>

          {/* Timeline projet unifiée — audit V3. Remplacera à terme le bloc
              "Historique" brut situé juste en-dessous (gardé 1 sprint en
              rétrocompat pour debug). */}
          <ProjectTimeline
            lead={lead}
            quotes={leadQuotes ?? []}
            invoices={leadInvoices ?? []}
          />

          {/* Timeline (Historique brut — déprécié au profit de ProjectTimeline) */}
          <div className="p-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-900)', marginBottom: 14 }}>Historique</h3>
            {events && events.length > 0 ? (
              <div className="timeline">
                {events.map(ev => (
                  <div className="timeline-item" key={ev.id}>
                    <div className="timeline-dot done">
                      <CheckCircle2 size={10} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 2, gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--gray-900)' }}>{humanizeEventDescription(ev.description)}</div>
                      <div
                        title={formatDateTime(ev.created_at)}
                        style={{ fontSize: 12, color: 'var(--gray-500)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
                      >
                        {formatDateTime(ev.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--gray-400)', textAlign: 'center', padding: '16px 0' }}>Aucun événement</p>
            )}
          </div>

          {/* Factures du chantier — uniquement après signature */}
          {lead.status === 'signe' && (
            <LeadInvoicesSection leadId={lead.id} clientId={lead.client_id} />
          )}
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
                  <label className="label-input">Montant du devis (€ {terms.base}) *</label>
                  <input className="input" type="number" inputMode="numeric" value={signAmount} onChange={e => setSignAmount(e.target.value)} placeholder="5 000" style={{ fontSize: 16 }} />
                </div>
                <div>
                  <label className="label-input">Date de signature</label>
                  <input className="input" type="date" value={signDate} onChange={e => setSignDate(e.target.value)} style={{ fontSize: 16 }} />
                </div>
              </div>
              {signAmount && Number(signAmount) > 0 && (
                <div style={{ padding: 14, background: 'var(--violet-50)', borderRadius: 'var(--radius-md)', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: 'var(--gray-600)' }}>Commission Celexia ({termsLabel})</div>
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
                {lead.signed_amount.toLocaleString('fr-FR')} € {terms.base}
              </div>
              {lead.signed_at && <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>Signé le {lead.signed_at}</div>}
              <div style={{ borderTop: '1px solid rgba(5,150,105,0.2)', marginTop: 12, paddingTop: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>Commission ({termsLabel})</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--violet-700)' }}>{calcCommission(lead.signed_amount, terms).toLocaleString('fr-FR')} €</div>
              </div>
              {signedQuote && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%', marginTop: 12, padding: '8px 14px', fontSize: 13 }}
                  onClick={() => navigate(`/portal/devis/${signedQuote.id}`)}
                >
                  <FileText size={14} /> Voir le devis {signedQuote.quote_number}
                </button>
              )}
            </div>
          )}

          {/* Créer un devis (lien direct lead → devis) */}
          {lead.status !== 'signe' && (
            <button
              className="btn btn-secondary"
              style={{ width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 600 }}
              onClick={() => navigate(`/portal/devis/nouveau?lead=${lead.id}`)}
            >
              <FileText size={16} /> Créer un devis
            </button>
          )}

          {/* Delete — uniquement pour les leads BAO (l'artisan ne peut pas
              supprimer les leads envoyés par Celexia, le trigger DB le bloque
              aussi côté serveur) */}
          {lead.source === 'bao' && (
            <button className="btn" style={{ width: '100%', background: 'white', color: '#DC2626', border: '1.5px solid #FECACA', padding: '10px 18px', fontSize: 14, fontWeight: 600 }} onClick={() => setDeleteOpen(true)}>
              <Trash2 size={16} /> Supprimer ce lead
            </button>
          )}
          {lead.source === 'lsa' && (
            <div className="rounded-[var(--radius-md)] border border-[var(--gray-200)] bg-[var(--gray-50)] p-3 text-xs text-[var(--gray-600)]">
              Ce lead a été envoyé par Celexia. Il ne peut pas être supprimé — mettez son statut à jour pour ne plus le voir.
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce lead&nbsp;?</AlertDialogTitle>
            <AlertDialogDescription>
              Le lead <strong>{lead?.name}</strong> sera archivé et disparaîtra de votre tableau.
              Vous pouvez contacter Celexia (<a href="mailto:agence.celexia@gmail.com" className="text-violet-600 hover:underline">agence.celexia@gmail.com</a>) pour le restaurer si besoin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
