import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Plus, X, BookOpen, FileDown, Eye, Send, CheckCircle2, Trash2, Upload } from 'lucide-react'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { usePortalLead } from '../hooks/use-portal-leads'
import {
  useCreateQuote,
  useIncrementLibraryUsage,
  useQuote,
  useQuoteLibrary,
  useQuoteSettings,
  useReplaceQuoteItems,
  useSoftDeleteQuote,
  useUpdateQuote,
} from '../hooks/use-quotes'
import { generateQuotePDF } from '../services/quote-pdf-generator'
import { QUOTE_STATUS_COLORS, QUOTE_STATUS_LABELS, QUOTE_UNITS, VAT_RATES } from '@/types/enums'
import { describeError } from '../lib/error-utils'
import type { Quote, QuoteItemLibrary, QuoteSettings, QuoteStatus } from '@/types'
import { supabase } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

interface DraftItem {
  key: string
  description: string
  quantity: number
  unit: string
  unit_price_ht: number
  vat_rate: number
}

function makeKey() { return Math.random().toString(36).slice(2, 10) }

function emptyItem(vat = 20): DraftItem {
  return { key: makeKey(), description: '', quantity: 1, unit: 'unité', unit_price_ht: 0, vat_rate: vat }
}

function todayISO(): string { return new Date().toISOString().slice(0, 10) }

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function PortalQuoteEditorPage() {
  const { id: routeId } = useParams<{ id?: string }>()
  const [search] = useSearchParams()
  const leadId = search.get('lead')
  const isNew = !routeId || routeId === 'nouveau'
  const navigate = useNavigate()
  const { client } = usePortalAuth()
  const clientId = client?.id

  const { data: settings } = useQuoteSettings(clientId)
  const { data: lead } = usePortalLead(leadId ?? undefined)
  const { data: quote, isLoading: loadingQuote } = useQuote(isNew ? undefined : routeId)

  const createQuote = useCreateQuote()
  const updateQuote = useUpdateQuote()
  const replaceItems = useReplaceQuoteItems()
  const softDelete = useSoftDeleteQuote()
  const incrementUsage = useIncrementLibraryUsage()

  // Local editable state
  const [recipient, setRecipient] = useState({
    name: '', address: '', postal: '', city: '', phone: '', email: '',
  })
  const [issuedAt, setIssuedAt] = useState<string>(todayISO())
  const [validUntil, setValidUntil] = useState<string>(addDays(todayISO(), 30))
  const [items, setItems] = useState<DraftItem[]>([emptyItem()])
  const [clientMessage, setClientMessage] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [footerNotes, setFooterNotes] = useState('')

  const [createdId, setCreatedId] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [signOpen, setSignOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // Hydrate from quote (existing mode)
  useEffect(() => {
    if (!quote) return
    setRecipient({
      name: quote.recipient_name ?? '',
      address: quote.recipient_address ?? '',
      postal: quote.recipient_postal_code ?? '',
      city: quote.recipient_city ?? '',
      phone: quote.recipient_phone ?? '',
      email: quote.recipient_email ?? '',
    })
    setIssuedAt(quote.issued_at)
    setValidUntil(quote.valid_until)
    setClientMessage(quote.client_message ?? '')
    setInternalNotes(quote.internal_notes ?? '')
    setPaymentTerms(quote.payment_terms ?? '')
    setFooterNotes(quote.footer_notes ?? '')
    if (quote.items && quote.items.length > 0) {
      setItems(quote.items.map((it) => ({
        key: it.id, description: it.description, quantity: Number(it.quantity),
        unit: it.unit, unit_price_ht: Number(it.unit_price_ht), vat_rate: Number(it.vat_rate),
      })))
    }
  }, [quote])

  // Pre-fill from lead (new mode)
  useEffect(() => {
    if (!isNew || !lead) return
    setRecipient((r) => ({
      ...r,
      name: r.name || lead.name,
      phone: r.phone || lead.phone,
      city: r.city || (lead.city ?? ''),
    }))
  }, [isNew, lead])

  // Pre-fill defaults from settings (only first render and when no quote yet)
  useEffect(() => {
    if (!settings || quote) return
    setValidUntil((cur) => {
      if (cur && cur !== addDays(todayISO(), 30)) return cur
      return addDays(issuedAt || todayISO(), settings.default_validity_days || 30)
    })
    setPaymentTerms((cur) => cur || settings.default_payment_terms || '')
    setFooterNotes((cur) => cur || settings.default_quote_footer || '')
    // Default VAT for first item if still 20
    setItems((curr) => {
      if (curr.length === 1 && curr[0].description === '' && curr[0].unit_price_ht === 0) {
        return [{ ...curr[0], vat_rate: settings.default_vat_rate || 20 }]
      }
      return curr
    })
  }, [settings, quote, issuedAt])

  // ── Computed totals ──
  const totals = useMemo(() => {
    let ht = 0, tva = 0
    for (const it of items) {
      const t = it.quantity * it.unit_price_ht
      ht += t
      tva += t * (it.vat_rate / 100)
    }
    return { ht, tva, ttc: ht + tva }
  }, [items])

  const isReadOnly = quote?.status === 'signed'

  // ── Actions ──

  async function ensureQuoteExists(): Promise<Quote | null> {
    if (quote) return quote
    if (createdId) {
      // already created earlier this session
      const { data } = await supabase.from('quotes').select('*').eq('id', createdId).maybeSingle()
      if (data) return data as Quote
    }
    if (!clientId) { toast.error('Client introuvable'); return null }
    if (!recipient.name.trim()) { toast.error('Nom du destinataire requis'); return null }
    const q = await createQuote.mutateAsync({
      client_id: clientId,
      portal_lead_id: leadId,
      recipient_name: recipient.name.trim(),
      recipient_address: recipient.address || null,
      recipient_postal_code: recipient.postal || null,
      recipient_city: recipient.city || null,
      recipient_phone: recipient.phone || null,
      recipient_email: recipient.email || null,
      issued_at: issuedAt,
      valid_until: validUntil,
      client_message: clientMessage || null,
      internal_notes: internalNotes || null,
      payment_terms: paymentTerms || null,
      footer_notes: footerNotes || null,
    })
    setCreatedId(q.id)
    // Replace URL
    navigate(`/portal/devis/${q.id}`, { replace: true })
    return q
  }

  async function persistAll(silent = false): Promise<Quote | null> {
    if (isReadOnly) return quote ?? null
    // Si le nom n'est pas encore renseigné en création, on ne fait rien
    // (évite de spammer des toasts sur le blur d'un autre champ).
    if (!quote && !createdId && !recipient.name.trim()) {
      if (!silent) toast.error('Nom du destinataire requis')
      return null
    }
    setBusy(true)
    try {
      const q = await ensureQuoteExists()
      if (!q) return null

      // Update quote header
      await updateQuote.mutateAsync({
        id: q.id,
        updates: {
          recipient_name: recipient.name.trim(),
          recipient_address: recipient.address || null,
          recipient_postal_code: recipient.postal || null,
          recipient_city: recipient.city || null,
          recipient_phone: recipient.phone || null,
          recipient_email: recipient.email || null,
          issued_at: issuedAt,
          valid_until: validUntil,
          client_message: clientMessage || null,
          internal_notes: internalNotes || null,
          payment_terms: paymentTerms || null,
          footer_notes: footerNotes || null,
        },
      })

      // Replace items
      await replaceItems.mutateAsync({
        quoteId: q.id,
        items: items
          .filter((it) => it.description.trim() !== '' || it.unit_price_ht > 0)
          .map((it, idx) => ({
            position: idx,
            description: it.description.trim() || '—',
            quantity: it.quantity,
            unit: it.unit,
            unit_price_ht: it.unit_price_ht,
            vat_rate: it.vat_rate,
          })),
      })

      return q
    } catch (err) {
      toast.error(`Sauvegarde échouée : ${describeError(err)}`)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function handleSave() {
    const q = await persistAll(false)
    if (q) toast.success('Devis enregistré')
  }

  /** Auto-save sur blur — silencieux si le devis n'existe pas encore et
   *  que le nom du destinataire n'est pas saisi. */
  async function handleAutoSave() {
    await persistAll(true)
  }

  async function handlePreview() {
    if (!settings) { toast.error('Paramètres devis non chargés'); return }
    const q = await persistAll()
    if (!q) return
    try {
      // Re-read items from DB so totals are up to date
      const { data: dbItems } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', q.id)
        .order('position', { ascending: true })
      const { data: freshQuote } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', q.id)
        .single()
      const blob = await generateQuotePDF(
        (freshQuote as Quote) ?? q,
        (dbItems as Quote['items']) ?? [],
        settings,
      )
      const url = URL.createObjectURL(blob)
      // iOS popup blocker workaround : <a> synthétique
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      toast.error(`Aperçu échoué : ${describeError(err)}`)
    }
  }

  async function handleDownload() {
    if (!settings) { toast.error('Paramètres devis non chargés'); return }
    const q = await persistAll()
    if (!q) return
    try {
      const { data: dbItems } = await supabase
        .from('quote_items').select('*').eq('quote_id', q.id).order('position', { ascending: true })
      const { data: freshQuote } = await supabase.from('quotes').select('*').eq('id', q.id).single()
      const blob = await generateQuotePDF((freshQuote as Quote) ?? q, (dbItems as Quote['items']) ?? [], settings)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${q.quote_number}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      toast.error(`Téléchargement échoué : ${describeError(err)}`)
    }
  }

  async function markAs(status: QuoteStatus) {
    const q = await persistAll()
    if (!q) return
    const updates: Partial<Quote> = { status }
    if (status === 'sent' && !q.sent_at) updates.sent_at = new Date().toISOString()
    await updateQuote.mutateAsync({ id: q.id, updates })
    toast.success(`Devis marqué ${QUOTE_STATUS_LABELS[status].toLowerCase()}`)
  }

  function addRow() {
    setItems((curr) => [...curr, emptyItem(settings?.default_vat_rate ?? 20)])
  }

  function removeRow(key: string) {
    setItems((curr) => {
      const next = curr.filter((it) => it.key !== key)
      return next.length ? next : [emptyItem(settings?.default_vat_rate ?? 20)]
    })
  }

  function updateRow(key: string, patch: Partial<DraftItem>) {
    setItems((curr) => curr.map((it) => it.key === key ? { ...it, ...patch } : it))
  }

  function applyLibraryItem(lib: QuoteItemLibrary) {
    setItems((curr) => [
      ...curr,
      {
        key: makeKey(),
        description: lib.label + (lib.description ? `\n${lib.description}` : ''),
        quantity: 1,
        unit: lib.default_unit,
        unit_price_ht: Number(lib.default_unit_price_ht),
        vat_rate: Number(lib.default_vat_rate),
      },
    ])
    incrementUsage.mutate(lib.id)
    setLibraryOpen(false)
  }

  async function handleDelete() {
    if (!quote) return
    setDeleteOpen(false)
    await softDelete.mutateAsync(quote.id)
    navigate('/portal/devis')
  }

  if (!isNew && loadingQuote) {
    return <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Chargement…</div>
  }

  const currentStatus: QuoteStatus = quote?.status ?? 'draft'
  const statusCols = QUOTE_STATUS_COLORS[currentStatus]

  return (
    <div>
      {/* Back + header */}
      <button
        type="button"
        className="btn btn-ghost mb-3 sm:mb-4"
        onClick={() => navigate('/portal/devis')}
        style={{ padding: '6px 10px', fontSize: 13 }}
      >
        <ArrowLeft size={14} /> Retour
      </button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 sm:mb-6">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="font-display text-xl font-bold leading-tight sm:text-2xl md:text-[26px]">
              {isNew && !quote ? 'Nouveau devis' : quote?.quote_number ?? 'Devis'}
            </h1>
            {quote && (
              <span className="p-tag" style={{ background: statusCols.bg, color: statusCols.color, border: 'none' }}>
                {QUOTE_STATUS_LABELS[currentStatus]}
              </span>
            )}
          </div>
          {quote && (
            <div className="text-xs text-[var(--gray-500)] sm:text-[13px]">
              Total TTC : {Number(quote.total_ttc).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
            </div>
          )}
        </div>
        {quote && quote.status !== 'signed' && (
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="btn"
            style={{ background: 'white', color: '#DC2626', border: '1.5px solid #FECACA', padding: '6px 12px', fontSize: 12 }}
          >
            <Trash2 size={13} /> Supprimer
          </button>
        )}
      </div>

      {!settings?.company_legal_name && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 sm:text-sm">
          Avant d'envoyer un devis, complétez vos infos d'entreprise dans{' '}
          <button className="font-semibold underline" onClick={() => navigate('/portal/parametres')}>Paramètres</button>.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]">
        <div className="flex flex-col gap-4 md:gap-5 min-w-0">
          {/* Destinataire */}
          <section className="p-card" style={{ padding: 16 }}>
            <h2 className="mb-3 font-display text-base font-bold text-[var(--gray-900)] sm:text-lg">Destinataire</h2>
            <Input
              label="Nom du client *"
              value={recipient.name}
              onChange={(v) => setRecipient({ ...recipient, name: v })}
              onBlur={handleAutoSave}
              disabled={isReadOnly}
              placeholder="Madame Dupont"
            />
            <Input
              label="Adresse"
              value={recipient.address}
              onChange={(v) => setRecipient({ ...recipient, address: v })}
              onBlur={handleAutoSave}
              disabled={isReadOnly}
              placeholder="12 rue des Lilas"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
              <Input
                label="Code postal"
                value={recipient.postal}
                onChange={(v) => setRecipient({ ...recipient, postal: v })}
                onBlur={handleAutoSave}
                disabled={isReadOnly}
              />
              <Input
                label="Ville"
                value={recipient.city}
                onChange={(v) => setRecipient({ ...recipient, city: v })}
                onBlur={handleAutoSave}
                disabled={isReadOnly}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Téléphone"
                value={recipient.phone}
                onChange={(v) => setRecipient({ ...recipient, phone: v })}
                onBlur={handleAutoSave}
                disabled={isReadOnly}
              />
              <Input
                label="Email"
                value={recipient.email}
                onChange={(v) => setRecipient({ ...recipient, email: v })}
                onBlur={handleAutoSave}
                disabled={isReadOnly}
              />
            </div>
          </section>

          {/* Dates */}
          <section className="p-card" style={{ padding: 16 }}>
            <h2 className="mb-3 font-display text-base font-bold text-[var(--gray-900)] sm:text-lg">Dates</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Date d'émission"
                type="date"
                value={issuedAt}
                onChange={setIssuedAt}
                onBlur={handleAutoSave}
                disabled={isReadOnly}
              />
              <Input
                label="Valide jusqu'au"
                type="date"
                value={validUntil}
                onChange={setValidUntil}
                onBlur={handleAutoSave}
                disabled={isReadOnly}
              />
            </div>
          </section>

          {/* Items */}
          <section className="p-card" style={{ padding: 16 }}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-[var(--gray-900)] sm:text-lg">Prestations</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setLibraryOpen(true)}
                  disabled={isReadOnly}
                  style={{ padding: '6px 12px', fontSize: 12 }}
                >
                  <BookOpen size={13} /> Bibliothèque
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {items.map((it, idx) => (
                <ItemRow
                  key={it.key}
                  index={idx}
                  item={it}
                  disabled={isReadOnly}
                  onChange={(patch) => updateRow(it.key, patch)}
                  onBlur={handleAutoSave}
                  onRemove={() => removeRow(it.key)}
                />
              ))}
            </div>

            {!isReadOnly && (
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-[var(--gray-300)] px-3 py-2 text-sm font-semibold text-[var(--violet-700)] hover:bg-[var(--violet-50)]"
                onClick={addRow}
              >
                <Plus size={14} /> Ajouter une ligne
              </button>
            )}
          </section>

          {/* Notes */}
          <section className="p-card" style={{ padding: 16 }}>
            <h2 className="mb-3 font-display text-base font-bold text-[var(--gray-900)] sm:text-lg">Notes</h2>
            <Textarea
              label="Message au client (visible sur le PDF)"
              value={clientMessage}
              onChange={setClientMessage}
              onBlur={handleAutoSave}
              disabled={isReadOnly}
            />
            <Textarea
              label="Notes internes (privées)"
              value={internalNotes}
              onChange={setInternalNotes}
              onBlur={handleAutoSave}
              disabled={isReadOnly}
            />
            <Textarea
              label="Conditions de paiement"
              value={paymentTerms}
              onChange={setPaymentTerms}
              onBlur={handleAutoSave}
              disabled={isReadOnly}
            />
            <Textarea
              label="Notes de bas de devis"
              value={footerNotes}
              onChange={setFooterNotes}
              onBlur={handleAutoSave}
              disabled={isReadOnly}
            />
          </section>
        </div>

        {/* Sidebar totals + actions */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
          <div className="p-card" style={{ padding: 18 }}>
            <h3 className="mb-3 font-display text-base font-bold text-[var(--gray-900)]">Totaux</h3>
            <div className="flex justify-between py-1 text-sm text-[var(--gray-700)]">
              <span>Total HT</span>
              <span className="font-semibold">{totals.ht.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</span>
            </div>
            <div className="flex justify-between py-1 text-sm text-[var(--gray-700)]">
              <span>TVA</span>
              <span className="font-semibold">{totals.tva.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-[var(--gray-200)] pt-2.5">
              <span className="font-bold text-[var(--gray-900)]">Total TTC</span>
              <span className="font-display text-lg font-bold text-[var(--violet-700)]">
                {totals.ttc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
              </span>
            </div>
          </div>

          <div className="p-card flex flex-col gap-2" style={{ padding: 14 }}>
            <button type="button" className="btn btn-secondary" onClick={handleSave} disabled={busy || isReadOnly}>
              <CheckCircle2 size={14} /> Enregistrer
            </button>
            <button type="button" className="btn btn-secondary" onClick={handlePreview} disabled={busy}>
              <Eye size={14} /> Aperçu PDF
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleDownload} disabled={busy}>
              <FileDown size={14} /> Télécharger PDF
            </button>
            {currentStatus === 'draft' && (
              <button type="button" className="btn btn-primary" onClick={() => markAs('sent')} disabled={busy}>
                <Send size={14} /> Marquer comme envoyé
              </button>
            )}
            {currentStatus === 'sent' && (
              <button type="button" className="btn btn-primary" onClick={() => setSignOpen(true)} disabled={busy}>
                <CheckCircle2 size={14} /> Marquer comme signé
              </button>
            )}
            {currentStatus === 'signed' && (
              <div className="rounded-md bg-emerald-50 p-2 text-center text-xs text-emerald-700">
                Devis signé · lecture seule
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Library Dialog */}
      <LibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        clientId={clientId}
        onPick={applyLibraryItem}
      />

      {/* Sign Dialog */}
      <SignDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        quote={quote}
        onDone={async () => { setSignOpen(false); await markAs('signed') }}
      />

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce devis ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le devis <strong>{quote?.quote_number}</strong> sera archivé. Cette action est réversible côté admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ──────────────────────────────────────────────────────────
// Inputs
// ──────────────────────────────────────────────────────────

function Input({
  label, value, onChange, onBlur, type = 'text', placeholder, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void
  type?: string; placeholder?: string; disabled?: boolean
}) {
  return (
    <div className="mb-3 last:mb-0">
      <label className="label-input">{label}</label>
      <input
        className="input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        style={{ fontSize: 16 }}
      />
    </div>
  )
}

function Textarea({
  label, value, onChange, onBlur, placeholder, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void
  placeholder?: string; disabled?: boolean
}) {
  return (
    <div className="mb-3 last:mb-0">
      <label className="label-input">{label}</label>
      <textarea
        className="textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        style={{ fontSize: 16, minHeight: 60 }}
      />
    </div>
  )
}

// ──────────────────────────────────────────────────────────
// Item row
// ──────────────────────────────────────────────────────────

function ItemRow({
  index, item, disabled, onChange, onBlur, onRemove,
}: {
  index: number
  item: DraftItem
  disabled?: boolean
  onChange: (patch: Partial<DraftItem>) => void
  onBlur: () => void
  onRemove: () => void
}) {
  const total = item.quantity * item.unit_price_ht
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--gray-200)] bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--gray-400)]">
          Ligne {index + 1}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md p-1.5 text-[var(--gray-400)] hover:bg-[var(--gray-100)] hover:text-red-600"
            aria-label="Supprimer la ligne"
            style={{ minWidth: 32, minHeight: 32 }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <textarea
        className="textarea mb-2.5"
        placeholder="Description (ex : Pose chauffe-eau électrique 200L)"
        value={item.description}
        onChange={(e) => onChange({ description: e.target.value })}
        onBlur={onBlur}
        disabled={disabled}
        style={{ fontSize: 16, minHeight: 50 }}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className="label-input">Qté</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={item.quantity}
            onChange={(e) => onChange({ quantity: Number(e.target.value) || 0 })}
            onBlur={onBlur}
            disabled={disabled}
            style={{ fontSize: 16 }}
            min="0"
            step="0.01"
          />
        </div>
        <div>
          <label className="label-input">Unité</label>
          <select
            className="select"
            value={item.unit}
            onChange={(e) => { onChange({ unit: e.target.value }); }}
            onBlur={onBlur}
            disabled={disabled}
            style={{ fontSize: 16 }}
          >
            {QUOTE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            {!QUOTE_UNITS.includes(item.unit as (typeof QUOTE_UNITS)[number]) && (
              <option value={item.unit}>{item.unit}</option>
            )}
          </select>
        </div>
        <div>
          <label className="label-input">PU HT (€)</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={item.unit_price_ht}
            onChange={(e) => onChange({ unit_price_ht: Number(e.target.value) || 0 })}
            onBlur={onBlur}
            disabled={disabled}
            style={{ fontSize: 16 }}
            min="0"
            step="0.01"
          />
        </div>
        <div>
          <label className="label-input">TVA</label>
          <select
            className="select"
            value={String(item.vat_rate)}
            onChange={(e) => { onChange({ vat_rate: Number(e.target.value) }); }}
            onBlur={onBlur}
            disabled={disabled}
            style={{ fontSize: 16 }}
          >
            {VAT_RATES.map((r) => <option key={r} value={r}>{r.toString().replace('.', ',')} %</option>)}
          </select>
        </div>
      </div>

      <div className="mt-2 text-right text-sm font-bold text-[var(--gray-900)]">
        Total HT : {total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────
// Library dialog
// ──────────────────────────────────────────────────────────

function LibraryDialog({
  open, onOpenChange, clientId, onPick,
}: {
  open: boolean
  onOpenChange: (b: boolean) => void
  clientId: string | undefined
  onPick: (item: QuoteItemLibrary) => void
}) {
  const { data: library } = useQuoteLibrary(clientId)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bibliothèque de prestations</DialogTitle>
          <DialogDescription>Cliquez sur une prestation pour l'ajouter au devis.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {!library || library.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--gray-500)]">
              Aucune prestation enregistrée. Ajoutez-en dans les Paramètres.
            </p>
          ) : (
            <ul className="m-0 list-none divide-y divide-[var(--gray-100)] p-0">
              {library.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => onPick(it)}
                    className="block w-full px-2 py-2.5 text-left hover:bg-[var(--gray-50)]"
                  >
                    <div className="font-semibold text-sm text-[var(--gray-900)]">{it.label}</div>
                    <div className="text-xs text-[var(--gray-500)]">
                      {Number(it.default_unit_price_ht).toLocaleString('fr-FR')} € / {it.default_unit} · TVA {it.default_vat_rate}%
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ──────────────────────────────────────────────────────────
// Sign dialog (upload signed PDF)
// ──────────────────────────────────────────────────────────

function SignDialog({
  open, onOpenChange, quote, onDone,
}: {
  open: boolean
  onOpenChange: (b: boolean) => void
  quote: Quote | null | undefined
  onDone: () => void
}) {
  const updateQuote = useUpdateQuote()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  async function handleConfirm() {
    if (!quote) return
    setUploading(true)
    try {
      let path: string | null = null
      if (file) {
        const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
        path = `${quote.client_id}/${quote.id}-signed-${Date.now()}.${ext}`
        const { error } = await supabase.storage.from('portal-quotes').upload(path, file, {
          contentType: file.type || 'application/pdf', upsert: true,
        })
        if (error) throw error
      }
      await updateQuote.mutateAsync({
        id: quote.id,
        updates: {
          status: 'signed',
          signed_at: new Date().toISOString(),
          ...(path ? { signed_pdf_path: path } : {}),
        },
      })
      toast.success('Devis signé enregistré')
      onDone()
    } catch (err) {
      toast.error(`Échec : ${describeError(err)}`)
    } finally { setUploading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marquer le devis comme signé</DialogTitle>
          <DialogDescription>
            Vous pouvez téléverser le PDF signé par votre client (optionnel).
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <label className="label-input">PDF signé</label>
          <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--gray-300)] bg-white px-3 py-3 text-sm text-[var(--gray-600)] hover:bg-[var(--gray-50)]">
            <Upload size={16} className="text-[var(--violet-600)]" />
            <span className="flex-1 truncate">{file ? file.name : 'Choisir un fichier PDF'}</span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <DialogFooter>
          <button type="button" className="btn btn-secondary" onClick={() => onOpenChange(false)}>Annuler</button>
          <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={uploading}>
            {uploading ? 'Enregistrement…' : 'Confirmer la signature'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
