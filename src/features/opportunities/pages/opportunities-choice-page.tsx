import { useNavigate } from 'react-router-dom'
import { Globe, Megaphone } from 'lucide-react'

export function OpportunitiesChoicePage() {
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Opportunités</h1>
        <p className="text-muted-foreground">Choisissez le type de pipeline</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 max-w-3xl">
        {/* Site Web Card */}
        <button
          onClick={() => navigate('/opportunities/site-web')}
          className="group relative flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-blue-200 bg-blue-50/50 hover:bg-blue-100 hover:border-blue-400 transition-all duration-200 text-left"
        >
          <div className="p-4 rounded-xl bg-blue-100 group-hover:bg-blue-200 transition-colors">
            <Globe className="h-10 w-10 text-blue-600" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold text-blue-900">Site Web</h2>
            <p className="text-sm text-blue-600 mt-1">
              Pipeline de vente de sites web
            </p>
          </div>
        </button>

        {/* Pub / LSA Card */}
        <button
          onClick={() => navigate('/opportunities/pub')}
          className="group relative flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-orange-200 bg-orange-50/50 hover:bg-orange-100 hover:border-orange-400 transition-all duration-200 text-left"
        >
          <div className="p-4 rounded-xl bg-orange-100 group-hover:bg-orange-200 transition-colors">
            <Megaphone className="h-10 w-10 text-orange-600" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold text-orange-900">Pub (LSA)</h2>
            <p className="text-sm text-orange-600 mt-1">
              Pipeline publicité — Local Services Ads
            </p>
            <p className="text-xs text-orange-500 mt-0.5">
              Commission 10% du CA généré
            </p>
          </div>
        </button>
      </div>
    </div>
  )
}
