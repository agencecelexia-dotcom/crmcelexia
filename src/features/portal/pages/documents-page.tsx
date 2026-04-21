import { usePortalAuth } from '../hooks/use-portal-auth'
import { supabase } from '@/lib/supabase/client'
import { FileText, Shield, Download, Building2 } from 'lucide-react'

function DocCard({ title, icon: Icon, status, statusColor, subtitle, path }: {
  title: string; icon: React.ElementType; status?: string; statusColor?: string; subtitle?: string; path?: string | null
}) {
  async function handleDownload() {
    if (!path) return
    const { data } = await supabase.storage.from('portal-documents').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <div className="p-card p-card-hoverable" style={{ padding: 20, cursor: path ? 'pointer' : 'default' }} onClick={path ? handleDownload : undefined}>
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
        </div>
        {path && <Download size={16} style={{ color: 'var(--gray-400)', flexShrink: 0, marginTop: 4 }} />}
      </div>
    </div>
  )
}

export function PortalDocumentsPage() {
  const { onboarding } = usePortalAuth()

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Documents</h1>
      <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 24 }}>Vos documents contractuels et légaux</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 28 }}>
        <DocCard
          title="Contrat Celexia"
          icon={FileText}
          status={onboarding?.contract_signed ? 'Signé' : 'Non signé'}
          statusColor={onboarding?.contract_signed ? 'emerald' : 'amber'}
          subtitle="Contrat de partenariat d'apport d'affaires"
        />
        <DocCard
          title="Assurance RC Pro"
          icon={Shield}
          status={onboarding?.rc_pro_uploaded ? 'Envoyée' : 'Manquante'}
          statusColor={onboarding?.rc_pro_uploaded ? 'emerald' : 'amber'}
          subtitle="Responsabilité civile professionnelle"
          path={onboarding?.rc_pro_path}
        />
        <DocCard
          title="Extrait Kbis"
          icon={Building2}
          status={onboarding?.kbis_uploaded ? 'Envoyé' : 'Manquant'}
          statusColor={onboarding?.kbis_uploaded ? 'emerald' : 'amber'}
          subtitle="Extrait de moins de 3 mois"
          path={onboarding?.kbis_path}
        />
        <DocCard
          title="Preuve de paiement"
          icon={FileText}
          status={onboarding?.payment_proof_uploaded ? 'Reçue' : 'Manquante'}
          statusColor={onboarding?.payment_proof_uploaded ? 'emerald' : 'amber'}
          subtitle="Justificatif de virement du budget pub"
          path={onboarding?.payment_proof_path}
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
