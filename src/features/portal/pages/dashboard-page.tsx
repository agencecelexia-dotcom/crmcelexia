import { usePortalAuth } from '../hooks/use-portal-auth'
import { usePortalLeadStats } from '../hooks/use-portal-leads'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { LayoutGrid, FileText, CheckCircle2, Euro, TrendingUp } from 'lucide-react'

function KpiCard({ label, value, icon: Icon, tone = 'violet' }: {
  label: string; value: string | number; icon: React.ElementType; tone?: 'violet' | 'emerald' | 'blue' | 'amber'
}) {
  const colors = {
    violet: 'bg-violet-100 text-violet-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    blue: 'bg-blue-100 text-blue-600',
    amber: 'bg-amber-100 text-amber-600',
  }
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[tone]}`}>
            <Icon className="h-4.5 w-4.5" />
          </div>
        </div>
        <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
        <p className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function formatEur(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })
}

export function PortalDashboardPage() {
  const { profile, client } = usePortalAuth()
  const { data: stats, isLoading } = usePortalLeadStats(client?.id)
  const firstName = profile?.full_name?.split(' ')[0] || 'artisan'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
          Bonjour, {firstName} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-1">Voici l'activité de votre compte {client?.company_name}</p>
      </div>

      {/* KPI cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Leads ce mois" value={stats.leads_this_month} icon={LayoutGrid} tone="blue" />
          <KpiCard label="Devis envoyés" value={stats.devis_envoyes} icon={FileText} tone="amber" />
          <KpiCard label="Devis signés" value={stats.signed_count} icon={CheckCircle2} tone="emerald" />
          <KpiCard label="CA généré" value={formatEur(stats.total_ca)} icon={TrendingUp} tone="violet" />
        </div>
      ) : null}

      {/* Commission preview card */}
      {stats && stats.total_commission > 0 && (
        <Card className="bg-gradient-to-br from-violet-600 to-violet-800 text-white border-0">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-violet-200 font-medium mb-1">Commission à payer</p>
                <p className="text-3xl font-bold" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                  {formatEur(stats.total_commission)}
                </p>
                <p className="text-xs text-violet-300 mt-1">10% des devis signés · facturation mensuelle</p>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                <Euro className="h-7 w-7" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Comment ça marche</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="space-y-1">
              <p className="font-semibold text-gray-900">1. On vous génère des leads</p>
              <p className="text-gray-500">Via Google Ads, vos leads apparaissent automatiquement dans le kanban.</p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-gray-900">2. Vous vendez</p>
              <p className="text-gray-500">Décrochez, proposez vos services, envoyez un devis.</p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-gray-900">3. Vous marquez comme signé</p>
              <p className="text-gray-500">On prend 10% du devis signé. Tout est transparent ici.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
