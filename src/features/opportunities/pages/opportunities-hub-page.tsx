import { useNavigate } from 'react-router-dom'
import { Globe, Megaphone, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { usePipelineStats } from '../hooks/use-opportunities'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { formatCurrency } from '@/lib/format'

export function OpportunitiesHubPage() {
  const navigate = useNavigate()
  const { profile, isFounder } = useAuth()
  const commercialId = isFounder ? undefined : profile?.id

  const { data: siteStats } = usePipelineStats(commercialId, 'site_web')
  const { data: pubStats } = usePipelineStats(commercialId, 'pub')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Opportunites</h1>
        <p className="text-muted-foreground">Choisissez votre pipeline</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
        {/* Site Web card */}
        <Card
          className="group cursor-pointer border-2 hover:border-blue-400 hover:shadow-lg transition-all duration-200"
          onClick={() => navigate('/opportunities/site-web')}
        >
          <CardContent className="p-8">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-blue-100 text-blue-600">
                <Globe className="h-7 w-7" />
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <h2 className="text-xl font-bold mb-1">Site Web</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Creation de sites web pour artisans et entreprises
            </p>
            {siteStats && (
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <p className="text-xs text-muted-foreground">Pipeline actif</p>
                  <p className="text-lg font-bold">{formatCurrency(siteStats.active_pipeline)}</p>
                  <p className="text-xs text-muted-foreground">{siteStats.active_count} opp.</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Close</p>
                  <p className="text-lg font-bold text-emerald-600">{formatCurrency(siteStats.won_total)}</p>
                  <p className="text-xs text-muted-foreground">{siteStats.won_count} gagnes</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pub LSA card */}
        <Card
          className="group cursor-pointer border-2 hover:border-amber-400 hover:shadow-lg transition-all duration-200"
          onClick={() => navigate('/opportunities/pub')}
        >
          <CardContent className="p-8">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-amber-100 text-amber-600">
                <Megaphone className="h-7 w-7" />
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <h2 className="text-xl font-bold mb-1">Pub (LSA)</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Local Services Ads — 10% de commission sur le CA genere
            </p>
            {pubStats && (
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <p className="text-xs text-muted-foreground">Pipeline actif</p>
                  <p className="text-lg font-bold">{formatCurrency(pubStats.active_pipeline)}</p>
                  <p className="text-xs text-muted-foreground">{pubStats.active_count} opp.</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Close</p>
                  <p className="text-lg font-bold text-emerald-600">{formatCurrency(pubStats.won_total)}</p>
                  <p className="text-xs text-muted-foreground">{pubStats.won_count} gagnes</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
