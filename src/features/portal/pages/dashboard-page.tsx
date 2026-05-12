import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { usePortalLeads, usePortalLeadStats } from '../hooks/use-portal-leads'
import { useRoiStats } from '../hooks/use-roi-stats'
import { Users, FileText, CheckCircle2, TrendingUp, Plus, Phone, ArrowRight } from 'lucide-react'
import { PortalKpiCard } from '../components/portal-kpi-card'
import { formatEur } from '../lib/format'

export function PortalDashboardPage() {
  const navigate = useNavigate()
  const { profile, client } = usePortalAuth()
  const { data: stats } = usePortalLeadStats(client?.id)
  const { data: leads } = usePortalLeads(client?.id)
  const { data: roi } = useRoiStats(client?.id)
  const firstName = profile?.full_name?.split(' ')[0] || 'artisan'

  // Build activity from leads. Tri par updated_at desc (activité réelle)
  // au lieu de created_at, sinon un signé récent disparaît si 5 nouveaux
  // leads ont été créés depuis.
  const sortedByActivity = [...(leads ?? [])].sort((a, b) => {
    const aTime = a.updated_at ?? a.created_at ?? ''
    const bTime = b.updated_at ?? b.created_at ?? ''
    return bTime.localeCompare(aTime)
  })
  const activities = sortedByActivity.slice(0, 5).map(l => {
    if (l.status === 'signe') return { icon: <CheckCircle2 size={16} />, tone: 'emerald', text: `Devis signé avec ${l.name}`, meta: `${l.signed_amount ? formatEur(l.signed_amount) : ''} · ${l.work_type}` }
    if (l.status === 'devis') return { icon: <FileText size={16} />, tone: 'amber', text: `Devis envoyé à ${l.name}`, meta: `${l.amount_estimated ? formatEur(l.amount_estimated) : ''} · ${l.work_type}` }
    if (l.status === 'qualifie') return { icon: <Phone size={16} />, tone: 'violet', text: `Appel qualifié : ${l.name}`, meta: l.work_type }
    return { icon: <Plus size={16} />, tone: 'blue', text: `Nouveau lead : ${l.name}`, meta: `${l.source === 'lsa' ? 'Celexia' : 'Bouche-à-oreille'} · ${l.city || ''}` }
  })

  const totalCa = stats?.total_ca || 0
  const totalCommission = stats?.total_commission || 0

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2 sm:mb-7 sm:gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-bold leading-tight sm:text-2xl md:text-[28px]">
            Bonjour {firstName}
          </h1>
          <p className="mt-0.5 text-xs text-[var(--gray-500)] sm:text-sm">
            <span className="hidden sm:inline">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} ·{' '}
            </span>
            <span className="sm:hidden">
              {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ·{' '}
            </span>
            Vos campagnes sont actives
          </p>
        </div>
        <button className="btn btn-primary flex-shrink-0" onClick={() => navigate('/portal/leads')} style={{ padding: '8px 14px', fontSize: 13 }}>
          <Plus size={16} /> <span className="hidden sm:inline">Nouveau lead</span><span className="sm:hidden">Lead</span>
        </button>
      </div>

      {/* KPI cards */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:mb-7 sm:gap-4 lg:grid-cols-4">
        <PortalKpiCard label="Leads ce mois" value={String(stats?.leads_this_month || 0)} icon={<Users size={18} />} tone="blue" />
        <PortalKpiCard label="Devis envoyés" value={String(stats?.devis_envoyes || 0)} icon={<FileText size={18} />} tone="amber" />
        <PortalKpiCard label="Devis signés" value={String(stats?.signed_count || 0)} icon={<CheckCircle2 size={18} />} tone="emerald" />
        <PortalKpiCard label="CA généré" value={formatEur(totalCa)} icon={<TrendingUp size={18} />} tone="violet" />
      </div>

      {/* Bandeau ROI Celexia — affiché uniquement si commission > 10 € */}
      {roi && roi.commission_celexia > 10 && (
        <div
          className="mb-5 sm:mb-7 rounded-[var(--radius-xl)] p-4 sm:p-6"
          style={{
            background: 'linear-gradient(135deg, var(--violet-600), var(--violet-700))',
            color: 'white',
            boxShadow: 'var(--shadow-violet)',
          }}
        >
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider opacity-85 sm:text-xs">
            <TrendingUp size={14} /> Celexia · {roi.period_label}
          </div>
          <div className="grid grid-cols-3 items-end gap-3">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider opacity-75 sm:text-xs">Commission</div>
              <div className="font-display text-base font-bold sm:text-2xl">{formatEur(roi.commission_celexia)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] font-medium uppercase tracking-wider opacity-75 sm:text-xs">CA signé</div>
              <div className="font-display text-base font-bold sm:text-2xl">{formatEur(roi.ca_signed)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-medium uppercase tracking-wider opacity-75 sm:text-xs">ROI</div>
              <div className="font-display text-xl font-bold sm:text-3xl">
                ×{Number.isFinite(roi.roi) ? roi.roi.toFixed(1) : '—'}
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] opacity-85 sm:text-xs">
            Pour 1&nbsp;€ versé à Celexia ces 30 derniers jours, vous avez signé {Number.isFinite(roi.roi) ? roi.roi.toFixed(1) : '—'}&nbsp;€ de devis.
          </p>
        </div>
      )}

      {/* Activity + Commission card */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:gap-5">
        {/* Activity */}
        <div className="p-card p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between sm:mb-4">
            <h2 className="font-display text-base font-bold sm:text-lg">Activité récente</h2>
            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => navigate('/portal/leads')}>Tout voir</button>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {activities.length > 0 ? activities.map((a, i) => {
              const bg: Record<string, string> = { emerald: 'var(--emerald-100)', amber: 'var(--amber-100)', blue: 'var(--blue-100)', violet: 'var(--violet-100)' }
              const fg: Record<string, string> = { emerald: 'var(--emerald-600)', amber: 'var(--amber-600)', blue: 'var(--blue-600)', violet: 'var(--violet-600)' }
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < activities.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: bg[a.tone], color: fg[a.tone], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {a.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: 'var(--gray-900)', fontWeight: 500 }}>{a.text}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{a.meta}</div>
                  </div>
                </div>
              )
            }) : (
              <p style={{ fontSize: 14, color: 'var(--gray-400)', padding: '20px 0', textAlign: 'center' }}>Aucune activité pour le moment</p>
            )}
          </div>
        </div>

        {/* Commission card */}
        <div
          className="flex min-h-[200px] flex-col p-4 sm:p-6 lg:min-h-[280px]"
          style={{
            background: 'linear-gradient(135deg, var(--violet-600), var(--violet-700))',
            color: 'white', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-violet)',
          }}
        >
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-85 sm:text-xs">
            Commission à payer
          </div>
          <div className="font-display text-3xl font-bold leading-none sm:text-[36px]">
            {formatEur(totalCommission)}
          </div>
          <div className="mt-1 text-xs opacity-85 sm:text-[13px]">
            sur {formatEur(totalCa)} de devis signés
          </div>
          <div className="mt-3 text-[11px] leading-relaxed opacity-80 sm:text-xs">
            Facturation le <strong className="opacity-100">1<sup>er</sup> du mois prochain</strong>.
          </div>
          <div className="mt-auto pt-3">
            <button
              type="button"
              className="btn flex w-full items-center justify-center"
              style={{ background: 'white', color: 'var(--violet-700)', padding: '10px 14px' }}
              onClick={() => navigate('/portal/commission')}
            >
              Voir les détails <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
