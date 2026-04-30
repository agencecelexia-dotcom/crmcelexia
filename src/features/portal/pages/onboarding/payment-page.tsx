import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { updateOnboarding, uploadPortalDocument } from '../../services/onboarding-service'
import { ProgressHeader } from '../../components/onboarding/progress-header'
import { ArrowLeft, ArrowRight, Upload, FileText, Trash2, Copy, Check, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

const IBAN = 'FR76 1695 8000 0129 8676 6973 937'
const BIC = 'QNTOFRP1XXX'
const SWIFT_PARTNER = 'TRWIBEB3XXX'
const REFERENCE = 'CELEXIA-LAUNCH'

function Row({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>{label}</span>
      <span className={mono ? 'font-mono' : ''} style={{
        fontSize: 14, fontWeight: 500,
        color: highlight ? 'var(--violet-700)' : 'var(--gray-900)',
        background: highlight ? 'var(--violet-50)' : 'transparent',
        padding: highlight ? '3px 10px' : 0, borderRadius: 6,
      }}>{value}</span>
    </div>
  )
}

export function PaymentPage() {
  const { onboarding, client, refreshOnboarding } = usePortalAuth()
  const navigate = useNavigate()
  const alreadyUploaded = !!onboarding?.payment_proof_uploaded
  const [file, setFile] = useState<{ name: string; size: string; raw?: File } | null>(
    alreadyUploaded ? { name: 'Preuve déjà transmise', size: '' } : null,
  )
  const [drag, setDrag] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function copyIban() {
    navigator.clipboard?.writeText(IBAN.replace(/\s/g, ''))
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  function onFile(f: File) {
    setFile({ name: f.name, size: (f.size / 1024).toFixed(0) + ' Ko', raw: f })
  }

  async function handleContinue() {
    if (!onboarding || !file || !client) return
    setSaving(true)
    try {
      // Upload uniquement si l'artisan a fourni un nouveau fichier
      if (file.raw) {
        const path = await uploadPortalDocument(client.id, file.raw, 'payment-proof')
        await updateOnboarding(onboarding.id, {
          payment_proof_uploaded: true,
          payment_proof_path: path,
          current_step: 3,
        } as Record<string, unknown>)
        await refreshOnboarding()
      }
      navigate('/portal/onboarding/gmb')
    } catch {
      toast.error("Erreur lors de l'upload")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <ProgressHeader step={2} title="Preuve de virement" />
      <p style={{ fontSize: 15, color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: 24 }}>
        Merci d'effectuer un virement sur le compte ci-dessous, puis téléversez la preuve.
      </p>

      {/* Bank details card */}
      <div className="p-card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
          Coordonnées bancaires Celexia
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <Row label="Bénéficiaire" value="CELEXIA" />
          <Row label="Banque" value="Qonto (Olinda SAS)" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 2 }}>IBAN</div>
              <div className="font-mono" style={{ fontSize: 14, color: 'var(--gray-900)', fontWeight: 500 }}>{IBAN}</div>
            </div>
            <button className="btn btn-secondary" onClick={copyIban} style={{ padding: '8px 14px', fontSize: 13 }}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copié !' : 'Copier'}
            </button>
          </div>
          <Row label="BIC / SWIFT" value={BIC} mono />
          <Row label="Référence virement" value={REFERENCE} mono highlight />
        </div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--gray-100)', fontSize: 12, color: 'var(--gray-500)', lineHeight: 1.5 }}>
          Pour un virement <strong style={{ color: 'var(--gray-700)' }}>SWIFT international</strong>, votre banque pourrait demander le BIC de la banque partenaire : <span className="font-mono" style={{ color: 'var(--gray-700)' }}>{SWIFT_PARTNER}</span>.
        </div>
      </div>

      {/* File upload */}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 10 }}>
        Preuve de virement (capture ou PDF)
      </div>
      {file ? (
        <div className="p-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: file.raw ? 'var(--violet-100)' : 'var(--emerald-100)', color: file.raw ? 'var(--violet-600)' : 'var(--emerald-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {file.raw ? <FileText size={20} /> : <CheckCircle2 size={20} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-900)' }}>{file.name}</div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{file.raw ? `${file.size} · Uploadé` : 'Cliquez sur la poubelle pour remplacer'}</div>
          </div>
          <button className="btn btn-ghost" onClick={() => setFile(null)}><Trash2 size={16} /></button>
        </div>
      ) : (
        <div
          className={`dropzone ${drag ? 'drag' : ''}`}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
          onClick={() => inputRef.current?.click()}
          style={{ marginBottom: 24 }}
        >
          <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--violet-100)', color: 'var(--violet-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Upload size={22} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-900)', marginBottom: 4 }}>Glissez votre fichier ici</div>
          <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>ou <span style={{ color: 'var(--violet-600)', fontWeight: 600 }}>parcourir</span> · PDF, JPG, PNG · 10 Mo max</div>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={() => navigate('/portal/onboarding/contract')}><ArrowLeft size={16} /> Retour</button>
        <button className="btn btn-primary lg" disabled={!file || saving} onClick={handleContinue}>
          {saving ? 'Envoi...' : 'Continuer'} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}
