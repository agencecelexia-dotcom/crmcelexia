import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { usePortalLeads, usePortalLeadStats } from '../hooks/use-portal-leads'
import { Users, FileText, CheckCircle2, TrendingUp, Plus, Phone, ArrowRight } from 'lucide-react'
import { PortalKpiCard } from '../components/portal-kpi-card'
import { formatEur } from '../lib/format'

export function PortalDashboardPage() {
  const navigate = useNavigate()
  const { profile, client } = usePortalAuth()
  const { data: stats } = usePortalLeadStats(client?.id)
  const { data: leads } = usePortalLeads(client?.id)
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="font-display" style={{ fontSize: 30, fontWeight: 700, marginBottom: 4 }}>
            Bonjour {firstName}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--gray-500)' }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Vos campagnes sont actives
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/portal/leads')}>
          <Plus size={16} /> Nouveau lead
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        <PortalKpiCard label="Leads ce mois" value={String(stats?.leads_this_month || 0)} icon={<Users size={18} />} tone="blue" />
        <PortalKpiCard label="Devis envoyés" value={String(stats?.devis_envoyes || 0)} icon={<FileText size={18} />} tone="amber" />
        <PortalKpiCard label="Devis signés" value={String(stats?.signed_count || 0)} icon={<CheckCircle2 size={18} />} tone="emerald" />
        <PortalKpiCard label="CA généré" value={formatEur(totalCa)} icon={<TrendingUp size={18} />} tone="violet" />
      </div>

      {/* Activity + Commission card */}
      <div className="grid gap-5 grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        {/* Activity */}
        <div className="p-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h2 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Activité récente</h2>
            <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => navigate('/portal/leads')}>Tout voir</button>
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
        <div className="min-h-[280px]" style={{
          background: 'linear-gradient(135deg, var(--violet-600), var(--violet-700))',
          color: 'white', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-violet)',
          padding: 24, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.85, marginBottom: 8 }}>
            Commission à payer
          </div>
          <div className="font-display" style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.1, marginBottom: 4 }}>
            {formatEur(totalCommission)}
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 20 }}>
            10 % de {formatEur(totalCa)} de devis signés
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 16, lineHeight: 1.5 }}>
            Facturation le <strong style={{ opacity: 1 }}>1<sup>er</sup> du mois prochain</strong>. Prélèvement SEPA automatique.
          </div>
          <div style={{ marginTop: 'auto' }}>
            <button
              className="btn"
              style={{ background: 'white', color: 'var(--violet-700)', width: '100%', padding: 12 }}
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
