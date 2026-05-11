import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { updateOnboarding, uploadPortalDocument } from '../../services/onboarding-service'
import { ProgressHeader } from '../../components/onboarding/progress-header'
import { getNextOnboardingStep } from '../../lib/onboarding-navigation'
import { ArrowLeft, ArrowRight, Upload, FileText, Trash2, Copy, Check, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { describeError } from '../../lib/error-utils'

const IBAN = 'FR76 1695 8000 0129 8676 6973 937'
const BIC = 'QNTOFRP1XXX'
const SWIFT_PARTNER = 'TRWIBEB3XXX'

function Row({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span
        className={`${mono ? 'font-mono' : ''} ${highlight ? 'rounded bg-violet-50 px-2.5 py-0.5 text-violet-700' : 'text-gray-900'} text-sm font-medium break-all sm:break-normal`}
      >
        {value}
      </span>
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
    let stage = 'init'
    try {
      let updated = onboarding
      if (file.raw) {
        stage = 'storage_upload'
        const path = await uploadPortalDocument(client.id, file.raw, 'payment-proof')
        stage = 'db_update'
        updated = await updateOnboarding(onboarding.id, {
          payment_proof_uploaded: true,
          payment_proof_path: path,
        })
        await refreshOnboarding()
      }
      navigate(getNextOnboardingStep(updated))
    } catch (err) {
      const msg = describeError(err)
      console.error(`[payment] stage=${stage} err=`, err)
      toast.error(`Erreur ${stage} : ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <ProgressHeader step={2} title="Preuve de virement" />
      <p className="mb-6 text-sm leading-relaxed text-gray-600 sm:text-[15px]">
        Merci d'effectuer un virement sur le compte ci-dessous, puis téléversez la preuve.
      </p>

      {/* Bank details card */}
      <div className="p-card mb-5 p-5 sm:p-6">
        <div className="mb-3.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Coordonnées bancaires Celexia
        </div>
        <div className="grid gap-3.5">
          <Row label="Bénéficiaire" value="CELEXIA" />
          <Row label="Banque" value="Qonto (Olinda SAS)" />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <div className="mb-0.5 text-xs text-gray-500">IBAN</div>
              <div className="font-mono break-all text-sm font-medium text-gray-900 sm:break-normal">{IBAN}</div>
            </div>
            <button
              className="btn btn-secondary self-start sm:self-auto"
              onClick={copyIban}
              style={{ padding: '8px 14px', fontSize: 13 }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copié !' : 'Copier'}
            </button>
          </div>
          <Row label="BIC / SWIFT" value={BIC} mono />
        </div>
        <div className="mt-3.5 border-t border-gray-100 pt-3.5 text-xs leading-relaxed text-gray-500">
          Pour un virement <strong className="text-gray-700">SWIFT international</strong>, votre banque pourrait demander le BIC de la banque partenaire&nbsp;: <span className="font-mono text-gray-700">{SWIFT_PARTNER}</span>.
        </div>
      </div>

      {/* File upload */}
      <div className="mb-2.5 text-xs font-semibold text-gray-700 sm:text-[13px]">
        Preuve de virement (capture ou PDF)
      </div>
      {file ? (
        <div className="p-card mb-6 flex items-center gap-3.5 p-4 sm:gap-4">
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${file.raw ? 'bg-violet-100 text-violet-600' : 'bg-emerald-100 text-emerald-600'}`}>
            {file.raw ? <FileText size={20} /> : <CheckCircle2 size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-gray-900">{file.name}</div>
            <div className="text-xs text-gray-500">{file.raw ? `${file.size} · Uploadé` : 'Cliquez sur la poubelle pour remplacer'}</div>
          </div>
          <button className="btn btn-ghost flex-shrink-0" onClick={() => setFile(null)}><Trash2 size={16} /></button>
        </div>
      ) : (
        <div
          className={`dropzone mb-6 ${drag ? 'drag' : ''}`}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[10px] bg-violet-100 text-violet-600">
            <Upload size={22} />
          </div>
          <div className="mb-1 text-sm font-semibold text-gray-900 sm:text-[15px]">Glissez votre fichier ici</div>
          <div className="text-xs text-gray-500 sm:text-[13px]">ou <span className="font-semibold text-violet-600">parcourir</span> · PDF, JPG, PNG · 10 Mo max</div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button className="btn btn-ghost w-full sm:w-auto" onClick={() => navigate('/portal/onboarding/welcome')}>
          <ArrowLeft size={16} /> Retour
        </button>
        <button className="btn btn-primary lg w-full sm:w-auto" disabled={!file || saving} onClick={handleContinue}>
          {saving ? 'Envoi…' : 'Continuer'} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}
