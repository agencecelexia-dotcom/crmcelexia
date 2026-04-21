import { usePortalAuth } from '../hooks/use-portal-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Shield, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

function DocCard({ title, icon: Icon, status, statusColor, subtitle, path }: {
  title: string
  icon: React.ElementType
  status?: string
  statusColor?: string
  subtitle?: string
  path?: string | null
}) {
  async function handleDownload() {
    if (!path) return
    const { data } = await supabase.storage.from('portal-documents').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600 shrink-0">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
            {status && (
              <Badge className={`mt-1.5 text-xs ${statusColor || 'bg-gray-100 text-gray-600'}`}>
                {status}
              </Badge>
            )}
          </div>
          {path && (
            <Button variant="ghost" size="icon" onClick={handleDownload} title="Télécharger">
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function PortalDocumentsPage() {
  const { onboarding } = usePortalAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
          Documents
        </h1>
        <p className="text-sm text-gray-500 mt-1">Vos documents contractuels et légaux</p>
      </div>

      {/* Documents grid */}
      <div className="grid md:grid-cols-2 gap-4">
        <DocCard
          title="Contrat Celexia"
          icon={FileText}
          status={onboarding?.contract_signed ? 'Signé' : 'Non signé'}
          statusColor={onboarding?.contract_signed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}
          subtitle="Contrat de partenariat d'apport d'affaires"
        />
        <DocCard
          title="Assurance RC Pro"
          icon={Shield}
          status={onboarding?.rc_pro_uploaded ? 'Envoyée' : 'Manquante'}
          statusColor={onboarding?.rc_pro_uploaded ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}
          subtitle="Responsabilité civile professionnelle"
          path={onboarding?.rc_pro_path}
        />
        <DocCard
          title="Extrait Kbis"
          icon={Shield}
          status={onboarding?.kbis_uploaded ? 'Envoyé' : 'Manquant'}
          statusColor={onboarding?.kbis_uploaded ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}
          subtitle="Extrait de moins de 3 mois"
          path={onboarding?.kbis_path}
        />
        <DocCard
          title="Preuve de paiement"
          icon={FileText}
          status={onboarding?.payment_proof_uploaded ? 'Reçue' : 'Manquante'}
          statusColor={onboarding?.payment_proof_uploaded ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}
          subtitle="Justificatif de virement du budget pub"
          path={onboarding?.payment_proof_path}
        />
      </div>

      {/* Invoices section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Factures</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400 py-6 text-center">
            Les factures apparaîtront ici à partir du mois prochain.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
