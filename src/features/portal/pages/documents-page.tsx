import { usePortalAuth } from '../hooks/use-portal-auth'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { FileText, Shield, Download, Building2, Upload } from 'lucide-react'

function DocCard({ title, icon: Icon, status, statusColor, subtitle, path, missing, onUpload }: {
  title: string
  icon: React.ElementType
  status?: string
  statusColor?: string
  subtitle?: string
  path?: string | null
  missing?: boolean
  onUpload?: () => void
}) {
  async function handleDownload() {
    if (!path) return
    const { data } = await supabase.storage.from('portal-documents').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const interactive = Boolean(path) || Boolean(missing && onUpload)
  function handleCardClick() {
    if (path) handleDownload()
    else if (missing && onUpload) onUpload()
  }

  return (
    <div
      className="p-card p-card-hoverable"
      style={{ padding: 20, cursor: interactive ? 'pointer' : 'default' }}
      onClick={interactive ? handleCardClick : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--violet-100)', color: 'var(--violet-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-900)', marginBottom: 2 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 6 }}>{subtitle}</div>}
          {status && (
            <span className="p-tag" style={{
              background: statusColor?.includes('emerald') ? 'var(--emerald-100)' : statusColor?.includes('amber') ? 'var(--amber-100)' : 'var(--gray-100)',
              color: statusColor?.includes('emerald') ? 'var(--emerald-600)' : statusColor?.includes('amber') ? 'var(--amber-600)' : 'var(--gray-600)',
              border: 'none',
            }}>
              {status}
            </span>
          )}
          {missing && onUpload && (
            <button
              type="button"
              className="btn btn-secondary mt-3"
              style={{ padding: '6px 12px', fontSize: 12 }}
              onClick={e => { e.stopPropagation(); onUpload() }}
            >
              <Upload size={13} /> Téléverser
            </button>
          )}
        </div>
        {path && <Download size={16} style={{ color: 'var(--gray-400)', flexShrink: 0, marginTop: 4 }} />}
      </div>
    </div>
  )
}

export function PortalDocumentsPage() {
  const { onboarding } = usePortalAuth()
  const navigate = useNavigate()
  const goToOnboarding = () => navigate('/portal/onboarding/welcome')

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Documents</h1>
      <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 24 }}>Vos documents contractuels et légaux</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 mb-7">
        <DocCard
          title="Contrat Celexia"
          icon={FileText}
          status={onboarding?.contract_signed ? 'Signé' : 'Non signé'}
          statusColor={onboarding?.contract_signed ? 'emerald' : 'amber'}
          subtitle="Contrat de partenariat d'apport d'affaires"
          missing={!onboarding?.contract_signed}
          onUpload={goToOnboarding}
        />
        <DocCard
          title="Assurance RC Pro"
          icon={Shield}
          status={onboarding?.rc_pro_uploaded ? 'Envoyée' : 'Manquante'}
          statusColor={onboarding?.rc_pro_uploaded ? 'emerald' : 'amber'}
          subtitle="Responsabilité civile professionnelle"
          path={onboarding?.rc_pro_path}
          missing={!onboarding?.rc_pro_uploaded}
          onUpload={goToOnboarding}
        />
        <DocCard
          title="Extrait Kbis"
          icon={Building2}
          status={onboarding?.kbis_uploaded ? 'Envoyé' : 'Manquant'}
          statusColor={onboarding?.kbis_uploaded ? 'emerald' : 'amber'}
          subtitle="Extrait de moins de 3 mois"
          path={onboarding?.kbis_path}
          missing={!onboarding?.kbis_uploaded}
          onUpload={goToOnboarding}
        />
        <DocCard
          title="Preuve de paiement"
          icon={FileText}
          status={onboarding?.payment_proof_uploaded ? 'Reçue' : 'Manquante'}
          statusColor={onboarding?.payment_proof_uploaded ? 'emerald' : 'amber'}
          subtitle="Justificatif de virement du budget pub"
          path={onboarding?.payment_proof_path}
          missing={!onboarding?.payment_proof_uploaded}
          onUpload={goToOnboarding}
        />
      </div>

      {/* Invoices */}
      <div className="p-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--gray-100)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-900)' }}>Factures</h2>
        </div>
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--gray-400)' }}>Les factures apparaîtront ici à partir du mois prochain.</p>
        </div>
      </div>
    </div>
  )
}
