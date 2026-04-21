import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { updateOnboarding, uploadPortalDocument } from '../../services/onboarding-service'
import { ProgressHeader } from '../../components/onboarding/progress-header'
import { ArrowLeft, ArrowRight, Upload, CheckCircle2, X, Check, Lock } from 'lucide-react'
import { toast } from 'sonner'

function DocUploadCard({ title, subtitle, file, setFile, criteria }: {
  title: string; subtitle: string; file: { name: string; raw?: File } | null
  setFile: (f: { name: string; raw?: File } | null) => void; criteria: string[]
}) {
  const [drag, setDrag] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  return (
    <div className="p-card" style={{ padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-900)', marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 14 }}>{subtitle}</div>
      {file ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: 'var(--emerald-100)', borderRadius: 8, marginBottom: 12 }}>
          <CheckCircle2 size={18} style={{ color: 'var(--emerald-600)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-900)' }}>{file.name}</div>
            <div style={{ fontSize: 11, color: 'var(--gray-600)' }}>Validé automatiquement</div>
          </div>
          <button className="btn btn-ghost" onClick={() => setFile(null)} style={{ padding: 6 }}><X size={14} /></button>
        </div>
      ) : (
        <div
          className={`dropzone ${drag ? 'drag' : ''}`}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) setFile({ name: f.name, raw: f }) }}
          onClick={() => ref.current?.click()}
          style={{ padding: 20, marginBottom: 14 }}
        >
          <input ref={ref} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setFile({ name: f.name, raw: f }) }} />
          <Upload size={22} style={{ color: 'var(--violet-600)' }} />
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: 'var(--gray-900)' }}>Téléverser un PDF</div>
          <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>ou glissez-déposez</div>
        </div>
      )}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Critères de validité</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
        {criteria.map((c, i) => (
          <li key={i} style={{ fontSize: 12, color: 'var(--gray-600)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Check size={14} style={{ color: 'var(--violet-600)', flexShrink: 0 }} />{c}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LegalPage() {
  const { onboarding, client, refreshOnboarding } = usePortalAuth()
  const navigate = useNavigate()
  const [rc, setRc] = useState<{ name: string; raw?: File } | null>(null)
  const [kbis, setKbis] = useState<{ name: string; raw?: File } | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleContinue() {
    if (!onboarding || !client || !rc?.raw || !kbis?.raw) return
    setSaving(true)
    try {
      const rcPath = await uploadPortalDocument(client.id, rc.raw, 'rc-pro')
      const kbisPath = await uploadPortalDocument(client.id, kbis.raw, 'kbis')
      await updateOnboarding(onboarding.id, {
        rc_pro_uploaded: true,
        rc_pro_path: rcPath,
        kbis_uploaded: true,
        kbis_path: kbisPath,
        current_step: 5,
      } as Record<string, unknown>)
      await refreshOnboarding()
      navigate('/portal/onboarding/training')
    } catch {
      toast.error("Erreur lors de l'upload")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <ProgressHeader step={4} title="Documents légaux" />
      <p style={{ fontSize: 15, color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: 28 }}>
        Ces deux documents sont requis pour activer vos campagnes.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
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
      <div className="p-card" style={{ padding: 18, background: 'var(--gray-50)', border: '1px solid var(--gray-200)', marginBottom: 28 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'white', border: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-600)' }}>
            <Lock size={16} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.55 }}>
            Ces documents sont chiffrés au repos et accessibles uniquement par l'équipe Celexia. Conformité RGPD — vous pouvez demander leur suppression à tout moment.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={() => navigate('/portal/onboarding/gmb')}><ArrowLeft size={16} /> Retour</button>
        <button className="btn btn-primary lg" disabled={!rc || !kbis || saving} onClick={handleContinue}>
          {saving ? 'Envoi...' : 'Continuer'} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}
