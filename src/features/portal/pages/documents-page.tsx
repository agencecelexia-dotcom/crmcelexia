import { usePortalAuth } from '../hooks/use-portal-auth'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { FileText, Shield, Download, Building2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { describeError } from '../lib/error-utils'

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
    try {
      const { data, error } = await supabase.storage.from('portal-documents').createSignedUrl(path, 3600)
      if (error) throw error
      if (!data?.signedUrl) throw new Error('URL signée introuvable')
      // iOS Safari popup blocker workaround : <a> synthétique cliqué.
      const link = document.createElement('a')
      link.href = data.signedUrl
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      toast.error(`Impossible d'ouvrir le document : ${describeError(err)}`)
    }
  }

  const interactive = Boolean(path) || Boolean(missing && onUpload)
  function handleCardClick() {
    if (path) handleDownload()
    else if (missing && onUpload) onUpload()
  }

  return (
    <div
      className={`p-card p-card-hoverable p-3.5 sm:p-5 ${interactive ? 'cursor-pointer' : ''}`}
      onClick={interactive ? handleCardClick : undefined}
    >
      <div className="flex items-start gap-3 sm:gap-3.5">
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] sm:h-11 sm:w-11 sm:rounded-xl"
          style={{ background: 'var(--violet-100)', color: 'var(--violet-600)' }}
        >
          <Icon size={18} className="sm:hidden" />
          <Icon size={22} className="hidden sm:block" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 text-sm font-semibold text-[var(--gray-900)] sm:text-[15px]">{title}</div>
          {subtitle && <div className="mb-1.5 text-[11px] text-[var(--gray-500)] sm:text-xs">{subtitle}</div>}
          {status && (
            <span
              className="p-tag"
              style={{
                background: statusColor?.includes('emerald') ? 'var(--emerald-100)' : statusColor?.includes('amber') ? 'var(--amber-100)' : 'var(--gray-100)',
                color: statusColor?.includes('emerald') ? 'var(--emerald-600)' : statusColor?.includes('amber') ? 'var(--amber-600)' : 'var(--gray-600)',
                border: 'none',
              }}
            >
              {status}
            </span>
          )}
          {missing && onUpload && (
            <button
              type="button"
              className="btn btn-secondary mt-2.5"
              style={{ padding: '6px 12px', fontSize: 12 }}
              onClick={e => { e.stopPropagation(); onUpload() }}
            >
              <Upload size={13} /> Téléverser
            </button>
          )}
        </div>
        {path && <Download size={16} className="mt-1 flex-shrink-0 text-[var(--gray-400)]" />}
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
      <h1 className="font-display mb-1 text-xl font-bold sm:mb-1.5 sm:text-2xl md:text-[26px]">Documents</h1>
      <p className="mb-4 text-xs text-[var(--gray-500)] sm:mb-6 sm:text-sm">Vos documents contractuels et légaux</p>

      <div className="mb-5 grid grid-cols-1 gap-2.5 sm:mb-7 sm:grid-cols-2 sm:gap-3.5 lg:grid-cols-3 xl:grid-cols-4">
        <DocCard
          title="Contrat Celexia"
          icon={FileText}
          status={onboarding?.contract_signed ? 'Signé' : 'Non signé'}
          statusColor={onboarding?.contract_signed ? 'emerald' : 'amber'}
          subtitle={onboarding?.contract_signed_at
            ? `Signé le ${new Date(onboarding.contract_signed_at).toLocaleDateString('fr-FR')}`
            : "Contrat d'apport d'affaires Celexia"}
          path={onboarding?.signed_contract_path}
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
