import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { updateOnboarding, uploadPortalDocument } from '../../services/onboarding-service'
import { ProgressHeader } from '../../components/onboarding/progress-header'
import { getNextOnboardingStep } from '../../lib/onboarding-navigation'
import { ArrowLeft, ArrowRight, Upload, CheckCircle2, X, Check, Lock } from 'lucide-react'
import { toast } from 'sonner'

function DocUploadCard({ title, subtitle, file, setFile, criteria }: {
  title: string; subtitle: string; file: { name: string; raw?: File } | null
  setFile: (f: { name: string; raw?: File } | null) => void; criteria: string[]
}) {
  const [drag, setDrag] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  return (
    <div className="p-card p-5">
      <div className="mb-0.5 text-sm font-semibold text-gray-900 sm:text-[15px]">{title}</div>
      <div className="mb-3.5 text-xs text-gray-500">{subtitle}</div>
      {file ? (
        <div className="mb-3 flex items-center gap-2.5 rounded-lg bg-emerald-100 p-3">
          <CheckCircle2 size={18} className="flex-shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-gray-900">{file.name}</div>
            <div className="text-[11px] text-gray-600">Validé automatiquement</div>
          </div>
          <button className="btn btn-ghost flex-shrink-0" onClick={() => setFile(null)} style={{ padding: 6 }}><X size={14} /></button>
        </div>
      ) : (
        <div
          className={`dropzone mb-3.5 ${drag ? 'drag' : ''}`}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) setFile({ name: f.name, raw: f }) }}
          onClick={() => ref.current?.click()}
        >
          <input ref={ref} type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setFile({ name: f.name, raw: f }) }} />
          <Upload size={22} className="mx-auto text-violet-600" />
          <div className="mt-2 text-[13px] font-semibold text-gray-900">Téléverser un PDF</div>
          <div className="text-[11px] text-gray-500">ou glissez-déposez</div>
        </div>
      )}
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Critères de validité</div>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {criteria.map((c, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
            <Check size={14} className="flex-shrink-0 text-violet-600" />{c}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LegalPage() {
  const { onboarding, client, refreshOnboarding } = usePortalAuth()
  const navigate = useNavigate()
  const rcAlreadyUploaded = !!onboarding?.rc_pro_uploaded
  const kbisAlreadyUploaded = !!onboarding?.kbis_uploaded
  const [rc, setRc] = useState<{ name: string; raw?: File } | null>(
    rcAlreadyUploaded ? { name: 'Déjà transmis' } : null,
  )
  const [kbis, setKbis] = useState<{ name: string; raw?: File } | null>(
    kbisAlreadyUploaded ? { name: 'Déjà transmis' } : null,
  )
  const [saving, setSaving] = useState(false)

  const rcReady = rc !== null
  const kbisReady = kbis !== null

  async function handleContinue() {
    if (!onboarding || !client || !rcReady || !kbisReady) return
    setSaving(true)
    try {
      const updates: Record<string, unknown> = { current_step: 5 }

      if (rc?.raw) {
        updates.rc_pro_path = await uploadPortalDocument(client.id, rc.raw, 'rc-pro')
        updates.rc_pro_uploaded = true
      }
      if (kbis?.raw) {
        updates.kbis_path = await uploadPortalDocument(client.id, kbis.raw, 'kbis')
        updates.kbis_uploaded = true
      }

      const updated = await updateOnboarding(onboarding.id, updates)
      await refreshOnboarding()
      navigate(getNextOnboardingStep(updated))
    } catch {
      toast.error("Erreur lors de l'upload")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <ProgressHeader step={4} title="Documents légaux" />
      <p className="mb-7 text-sm leading-relaxed text-gray-600 sm:text-[15px]">
        Ces deux documents sont requis pour activer vos campagnes.
      </p>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <DocUploadCard
          title="Assurance Responsabilité Civile Pro"
          subtitle="PDF · en cours de validité"
          file={rc}
          setFile={setRc}
          criteria={["Au nom de votre entreprise", "Date d'échéance ≥ 90 jours", "Mention activité bâtiment / artisanat"]}
        />
        <DocUploadCard
          title="Extrait Kbis"
          subtitle="PDF · moins de 3 mois"
          file={kbis}
          setFile={setKbis}
          criteria={["Daté de moins de 3 mois", "SIREN / SIRET lisible", "Fourni par Infogreffe ou similaire"]}
        />
      </div>

      {/* RGPD notice */}
      <div className="p-card mb-7 border border-gray-200 bg-gray-50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600">
            <Lock size={16} />
          </div>
          <div className="text-[13px] leading-relaxed text-gray-600">
            Ces documents sont chiffrés au repos et accessibles uniquement par l'équipe Celexia. Conformité RGPD — vous pouvez demander leur suppression à tout moment.
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button className="btn btn-ghost w-full sm:w-auto" onClick={() => navigate('/portal/onboarding/welcome')}>
          <ArrowLeft size={16} /> Retour
        </button>
        <button className="btn btn-primary lg w-full sm:w-auto" disabled={!rc || !kbis || saving} onClick={handleContinue}>
          {saving ? 'Envoi…' : 'Enregistrer et continuer'} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}
