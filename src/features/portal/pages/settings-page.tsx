import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Upload, Trash2, Plus, Sparkles } from 'lucide-react'
import { usePortalAuth } from '../hooks/use-portal-auth'
import {
  useAddToLibrary,
  useQuoteLibrary,
  useQuoteSettings,
  useRemoveFromLibrary,
  useUploadQuoteLogo,
  useUpsertQuoteSettings,
} from '../hooks/use-quotes'
import { getQuoteLogoUrl } from '../services/quote-service'
import { getSectorPresets } from '../lib/quote-sector-presets'
import { COMPANY_FORMS, VAT_RATES } from '@/types/enums'
import type { QuoteSettings } from '@/types'

type Settings = QuoteSettings

const SECTIONS: Array<{ id: string; title: string }> = [
  { id: 'company', title: 'Mon entreprise' },
  { id: 'insurance', title: 'Assurance décennale' },
  { id: 'rib', title: 'RIB' },
  { id: 'defaults', title: 'Devis (défauts)' },
  { id: 'library', title: 'Bibliothèque de prestations' },
]

export function PortalSettingsPage() {
  const { client } = usePortalAuth()
  const clientId = client?.id
  const { data: settings, isLoading } = useQuoteSettings(clientId)
  const upsert = useUpsertQuoteSettings()
  const uploadLogo = useUploadQuoteLogo()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Fetch signed URL for logo when path changes
  useEffect(() => {
    let alive = true
    if (settings?.logo_path) {
      getQuoteLogoUrl(settings.logo_path).then((url) => { if (alive) setLogoUrl(url) })
    } else {
      setLogoUrl(null)
    }
    return () => { alive = false }
  }, [settings?.logo_path])

  function patch(updates: Partial<Settings>) {
    if (!clientId) return
    upsert.mutate({ clientId, updates }, {
      onSuccess: () => toast.success('Enregistré', { duration: 1200 }),
    })
  }

  async function handleLogo(file: File) {
    if (!clientId) return
    if (file.size > 4_000_000) { toast.error('Logo trop volumineux (max 4 Mo)'); return }
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) { toast.error('Format non supporté (PNG/JPG)'); return }
    await uploadLogo.mutateAsync({ clientId, file })
  }

  if (isLoading || !clientId) {
    return <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Chargement...</div>
  }

  const s: Partial<Settings> = settings ?? {}

  return (
    <div>
      <div className="mb-4 sm:mb-6">
        <h1 className="font-display text-xl font-bold leading-tight sm:text-2xl md:text-[26px]">Paramètres</h1>
        <p className="mt-1 text-xs text-[var(--gray-500)] sm:text-sm">
          Configurez votre entreprise pour personnaliser vos devis.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(180px,1fr)]">
        <div className="flex flex-col gap-4 md:gap-5 min-w-0">
          {/* ── Mon entreprise ── */}
          <section id="company" className="p-card" style={{ padding: 20 }}>
            <h2 className="mb-4 font-display text-base font-bold text-[var(--gray-900)] sm:text-lg">Mon entreprise</h2>

            {/* Logo */}
            <div className="mb-4">
              <label className="label-input">Logo</label>
              {logoUrl ? (
                <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--gray-200)] bg-white p-3">
                  <img src={logoUrl} alt="Logo" className="h-16 w-auto max-w-[120px] object-contain" />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: 12 }}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload size={13} /> Changer
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]; if (f) handleLogo(f)
                      e.target.value = ''
                    }}
                  />
                </div>
              ) : (
                <div
                  className={`dropzone ${drag ? 'drag' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault(); setDrag(false)
                    const f = e.dataTransfer.files[0]; if (f) handleLogo(f)
                  }}
                  onClick={() => fileRef.current?.click()}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogo(f); e.target.value = '' }}
                  />
                  <Upload size={22} className="mx-auto text-violet-600" />
                  <div className="mt-2 text-[13px] font-semibold text-gray-900">Téléverser un logo</div>
                  <div className="text-[11px] text-gray-500">PNG/JPG · ou glissez-déposez</div>
                </div>
              )}
            </div>

            <Field label="Raison sociale" value={s.company_legal_name ?? ''} onSave={(v) => patch({ company_legal_name: v || null })} placeholder="Ex : Plomberie Dupont SARL" />
            <SelectField
              label="Forme juridique"
              value={s.company_form ?? ''}
              options={[...COMPANY_FORMS]}
              onSave={(v) => patch({ company_form: v || null })}
            />
            <Field label="Adresse" value={s.company_address ?? ''} onSave={(v) => patch({ company_address: v || null })} placeholder="12 rue des Lilas" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
              <Field label="Code postal" value={s.company_postal_code ?? ''} onSave={(v) => patch({ company_postal_code: v || null })} placeholder="75001" />
              <Field label="Ville" value={s.company_city ?? ''} onSave={(v) => patch({ company_city: v || null })} placeholder="Paris" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Téléphone" value={s.company_phone ?? ''} onSave={(v) => patch({ company_phone: v || null })} placeholder="06 12 34 56 78" />
              <Field label="Email" value={s.company_email ?? ''} onSave={(v) => patch({ company_email: v || null })} placeholder="contact@…" />
            </div>
            <Field label="Site web" value={s.company_website ?? ''} onSave={(v) => patch({ company_website: v || null })} placeholder="https://…" />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="SIRET" value={s.siret ?? ''} onSave={(v) => patch({ siret: v || null })} placeholder="14 chiffres" />
              <Field label="SIREN" value={s.siren ?? ''} onSave={(v) => patch({ siren: v || null })} placeholder="9 chiffres" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Code APE / NAF" value={s.ape_code ?? ''} onSave={(v) => patch({ ape_code: v || null })} placeholder="4322A" />
              <Field label="RCS (ville)" value={s.rcs_city ?? ''} onSave={(v) => patch({ rcs_city: v || null })} placeholder="Paris" />
            </div>
            <Field label="N° TVA intracommunautaire" value={s.vat_number ?? ''} onSave={(v) => patch({ vat_number: v || null })} placeholder="FR 12 345 678 901" />
          </section>

          {/* ── Assurance décennale ── */}
          <section id="insurance" className="p-card" style={{ padding: 20 }}>
            <h2 className="mb-4 font-display text-base font-bold text-[var(--gray-900)] sm:text-lg">Assurance décennale</h2>
            <Field label="Assureur" value={s.decennale_provider ?? ''} onSave={(v) => patch({ decennale_provider: v || null })} placeholder="Ex : MAAF Pro" />
            <Field label="N° de police" value={s.decennale_policy ?? ''} onSave={(v) => patch({ decennale_policy: v || null })} placeholder="Numéro de contrat" />
          </section>

          {/* ── RIB ── */}
          <section id="rib" className="p-card" style={{ padding: 20 }}>
            <h2 className="mb-4 font-display text-base font-bold text-[var(--gray-900)] sm:text-lg">Coordonnées bancaires</h2>
            <Field label="IBAN" value={s.iban ?? ''} onSave={(v) => patch({ iban: v || null })} placeholder="FR76 …" />
            <Field label="BIC / SWIFT" value={s.bic ?? ''} onSave={(v) => patch({ bic: v || null })} placeholder="BNPAFRPP" />
          </section>

          {/* ── Devis (défauts) ── */}
          <section id="defaults" className="p-card" style={{ padding: 20 }}>
            <h2 className="mb-4 font-display text-base font-bold text-[var(--gray-900)] sm:text-lg">Devis (défauts)</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SelectField
                label="TVA par défaut"
                value={String(s.default_vat_rate ?? 20)}
                options={VAT_RATES.map((r) => String(r))}
                renderOption={(v) => `${v.replace('.', ',')} %`}
                onSave={(v) => patch({ default_vat_rate: Number(v) })}
              />
              <Field
                label="Validité (jours)"
                type="number"
                value={String(s.default_validity_days ?? 30)}
                onSave={(v) => patch({ default_validity_days: Number(v) || 30 })}
                placeholder="30"
              />
            </div>
            <TextareaField
              label="Conditions de paiement (défaut)"
              value={s.default_payment_terms ?? ''}
              onSave={(v) => patch({ default_payment_terms: v || null })}
              placeholder="Paiement à 30 jours…"
            />
            <TextareaField
              label="Notes de bas de devis (défaut)"
              value={s.default_quote_footer ?? ''}
              onSave={(v) => patch({ default_quote_footer: v || null })}
              placeholder="Acompte de 30% à la commande…"
            />
            <Field
              label="Préfixe de numérotation"
              value={s.quote_number_prefix ?? 'DEV'}
              onSave={(v) => patch({ quote_number_prefix: v || 'DEV' })}
              placeholder="DEV"
            />
          </section>

          {/* ── Bibliothèque ── */}
          <LibrarySection clientId={clientId} profession={client?.profession ?? null} />
        </div>

        {/* Nav latérale (desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-4 p-card" style={{ padding: 14 }}>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--gray-400)]">Sections</div>
            {SECTIONS.map((sec) => (
              <a
                key={sec.id}
                href={`#${sec.id}`}
                className="block rounded-md px-2 py-1.5 text-sm text-[var(--gray-700)] hover:bg-[var(--gray-100)]"
              >
                {sec.title}
              </a>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────
// Field components (auto-save on blur)
// ──────────────────────────────────────────────────────────

function Field({
  label, value, onSave, placeholder, type = 'text',
}: {
  label: string; value: string; onSave: (v: string) => void; placeholder?: string; type?: string
}) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <div className="mb-3">
      <label className="label-input">{label}</label>
      <input
        className="input"
        type={type}
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== value) onSave(v) }}
        style={{ fontSize: 16 }}
      />
    </div>
  )
}

function SelectField({
  label, value, options, onSave, renderOption,
}: {
  label: string; value: string; options: string[]; onSave: (v: string) => void
  renderOption?: (opt: string) => string
}) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <div className="mb-3">
      <label className="label-input">{label}</label>
      <select
        className="select"
        value={v}
        onChange={(e) => { setV(e.target.value); onSave(e.target.value) }}
        style={{ fontSize: 16 }}
      >
        <option value="">— Sélectionner —</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{renderOption ? renderOption(opt) : opt}</option>
        ))}
      </select>
    </div>
  )
}

function TextareaField({
  label, value, onSave, placeholder,
}: { label: string; value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <div className="mb-3">
      <label className="label-input">{label}</label>
      <textarea
        className="textarea"
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== value) onSave(v) }}
        style={{ fontSize: 16, minHeight: 70 }}
      />
    </div>
  )
}

// ──────────────────────────────────────────────────────────
// Library section
// ──────────────────────────────────────────────────────────

function LibrarySection({ clientId, profession }: { clientId: string; profession: string | null }) {
  const { data: library } = useQuoteLibrary(clientId)
  const add = useAddToLibrary()
  const remove = useRemoveFromLibrary()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ label: '', description: '', unit: 'unité', price: '0', vat: '10' })

  async function handleAdd() {
    if (!form.label.trim()) { toast.error('Libellé requis'); return }
    await add.mutateAsync({
      clientId,
      item: {
        label: form.label.trim(),
        description: form.description.trim() || null,
        default_unit: form.unit,
        default_unit_price_ht: Number(form.price) || 0,
        default_vat_rate: Number(form.vat) || 10,
      },
    })
    setForm({ label: '', description: '', unit: 'unité', price: '0', vat: '10' })
    setAdding(false)
  }

  async function initFromSector() {
    const preset = getSectorPresets(profession)
    if (!preset.suggestedItems.length) {
      toast.info('Aucune suggestion pour ce métier')
      return
    }
    for (const item of preset.suggestedItems) {
      await add.mutateAsync({
        clientId,
        item: {
          label: item.label,
          description: item.description ?? null,
          default_unit: item.unit,
          default_unit_price_ht: item.price,
          default_vat_rate: item.vat,
        },
      })
    }
    toast.success(`${preset.suggestedItems.length} prestations ajoutées`)
  }

  return (
    <section id="library" className="p-card" style={{ padding: 20 }}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold text-[var(--gray-900)] sm:text-lg">Bibliothèque de prestations</h2>
        {!adding && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: 12 }}
            onClick={() => setAdding(true)}
          >
            <Plus size={13} /> Ajouter
          </button>
        )}
      </div>

      {library && library.length === 0 && !adding && (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--gray-300)] p-4 text-center">
          <p className="mb-3 text-sm text-[var(--gray-600)]">
            Aucune prestation enregistrée. Gagnez du temps en pré-remplissant vos prestations habituelles.
          </p>
          {profession && getSectorPresets(profession).suggestedItems.length > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '8px 14px', fontSize: 13 }}
              onClick={initFromSector}
            >
              <Sparkles size={14} /> Initialiser pour {profession}
            </button>
          )}
        </div>
      )}

      {adding && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--violet-200)] bg-[var(--violet-50)] p-3.5">
          <label className="label-input">Libellé *</label>
          <input
            className="input mb-3"
            placeholder="Pose chauffe-eau"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            style={{ fontSize: 16 }}
          />
          <textarea
            className="textarea mb-3"
            placeholder="Description (optionnel)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={{ fontSize: 16, minHeight: 60 }}
          />
          <div className="mb-3 grid grid-cols-3 gap-2">
            <input
              className="input"
              placeholder="Unité"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              style={{ fontSize: 16 }}
            />
            <input
              className="input"
              type="number"
              inputMode="decimal"
              placeholder="PU HT"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              style={{ fontSize: 16 }}
            />
            <input
              className="input"
              type="number"
              inputMode="decimal"
              placeholder="TVA %"
              value={form.vat}
              onChange={(e) => setForm({ ...form, vat: e.target.value })}
              style={{ fontSize: 16 }}
            />
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handleAdd} style={{ flex: 1 }}>Ajouter</button>
            <button className="btn btn-secondary" onClick={() => setAdding(false)}>Annuler</button>
          </div>
        </div>
      )}

      {library && library.length > 0 && (
        <ul className="m-0 list-none divide-y divide-[var(--gray-100)] p-0">
          {library.map((it) => (
            <li key={it.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[var(--gray-900)]">{it.label}</div>
                <div className="text-xs text-[var(--gray-500)]">
                  {it.default_unit_price_ht.toLocaleString('fr-FR')} € / {it.default_unit} · TVA {it.default_vat_rate}%
                  {it.usage_count > 0 && ` · Utilisée ${it.usage_count} fois`}
                </div>
                {it.description && (
                  <div className="mt-0.5 text-xs text-[var(--gray-500)] line-clamp-2">{it.description}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove.mutate(it.id)}
                className="rounded-md p-1.5 text-[var(--gray-400)] hover:bg-[var(--gray-100)] hover:text-red-600"
                aria-label={`Supprimer ${it.label}`}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
