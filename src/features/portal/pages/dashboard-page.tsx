import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { usePortalLeads, usePortalLeadStats } from '../hooks/use-portal-leads'
import { Users, FileText, CheckCircle2, TrendingUp, Plus, Phone, ArrowRight } from 'lucide-react'

function KPI({ label, value, delta, icon, tone = 'violet' }: {
  label: string; value: string; delta?: string; icon: React.ReactNode; tone?: string
}) {
  const toneBg: Record<string, string> = { violet: 'var(--violet-100)', emerald: 'var(--emerald-100)', blue: 'var(--blue-100)', amber: 'var(--amber-100)' }
  const toneFg: Record<string, string> = { violet: 'var(--violet-600)', emerald: 'var(--emerald-600)', blue: 'var(--blue-600)', amber: 'var(--amber-600)' }
  return (
    <div className="p-card p-card-hoverable" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: toneBg[tone], color: toneFg[tone], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
        {delta && <span style={{ fontSize: 12, fontWeight: 600, color: delta.startsWith('+') ? 'var(--emerald-600)' : 'var(--gray-500)' }}>{delta}</span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--gray-500)', fontWeight: 500, marginBottom: 4, letterSpacing: '0.01em' }}>{label}</div>
      <div className="font-display" style={{ fontSize: 28, fontWeight: 700, color: 'var(--gray-900)' }}>{value}</div>
    </div>
  )
}

function formatEur(n: number) {
  return n.toLocaleString('fr-FR') + ' €'
}

export function PortalDashboardPage() {
  const navigate = useNavigate()
  const { profile, client } = usePortalAuth()
  const { data: stats } = usePortalLeadStats(client?.id)
  const { data: leads } = usePortalLeads(client?.id)
  const firstName = profile?.full_name?.split(' ')[0] || 'artisan'

  // Build activity from recent leads
  const activities = (leads ?? []).slice(0, 5).map(l => {
    if (l.status === 'signe') return { icon: <CheckCircle2 size={16} />, tone: 'emerald', text: `Devis signé avec ${l.name}`, meta: `${l.signed_amount ? formatEur(l.signed_amount) : ''} · ${l.work_type}` }
    if (l.status === 'devis') return { icon: <FileText size={16} />, tone: 'amber', text: `Devis envoyé à ${l.name}`, meta: `${l.amount_estimated ? formatEur(l.amount_estimated) : ''} · ${l.work_type}` }
    if (l.status === 'qualifie') return { icon: <Phone size={16} />, tone: 'violet', text: `Appel qualifié : ${l.name}`, meta: l.work_type }
    return { icon: <Plus size={16} />, tone: 'blue', text: `Nouveau lead : ${l.name}`, meta: `${l.source === 'lsa' ? 'Google Ads' : 'BAO'} · ${l.city || ''}` }
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        <KPI label="Leads ce mois" value={String(stats?.leads_this_month || 0)} icon={<Users size={18} />} tone="blue" />
        <KPI label="Devis envoyés" value={String(stats?.devis_envoyes || 0)} icon={<FileText size={18} />} tone="amber" />
        <KPI label="Devis signés" value={String(stats?.signed_count || 0)} icon={<CheckCircle2 size={18} />} tone="emerald" />
        <KPI label="CA généré" value={formatEur(totalCa)} icon={<TrendingUp size={18} />} tone="violet" />
      </div>

      {/* Activity + Commission card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 20 }}>
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
        <div style={{
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
