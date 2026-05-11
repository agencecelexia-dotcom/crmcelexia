import { useState } from 'react'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { usePortalLeads, usePortalLeadStats } from '../hooks/use-portal-leads'
import { Euro, CheckCircle2, TrendingUp, Info, ChevronDown } from 'lucide-react'
import { PortalKpiCard } from '../components/portal-kpi-card'
import { formatEur } from '../lib/format'

export function PortalCommissionPage() {
  const { client } = usePortalAuth()
  const { data: leads } = usePortalLeads(client?.id)
  const { data: stats } = usePortalLeadStats(client?.id)
  const [explainerOpen, setExplainerOpen] = useState(false)

  const signedLeads = (leads ?? []).filter(l => l.status === 'signe' && l.signed_amount)
  const totalCa = stats?.total_ca || 0
  const totalCommission = stats?.total_commission || 0

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 26, fontWeight: 700, marginBottom: 20 }}>Commission</h1>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        {/* Commission card — violet bg */}
        <div style={{
          background: 'linear-gradient(135deg, var(--violet-600), var(--violet-700))',
          color: 'white', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-violet)', padding: 20,
        }}>
          <Euro size={18} style={{ opacity: 0.8, marginBottom: 8 }} />
          <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 500 }}>À payer ce mois</div>
          <div className="font-display" style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{formatEur(stats?.commission_this_month || 0)} HT</div>
        </div>
        <PortalKpiCard
          label="Devis signés · ce mois"
          value={String(stats?.signed_this_month || 0)}
          icon={<CheckCircle2 size={18} />}
          tone="emerald"
        />
        <PortalKpiCard
          label={`Cumul ${new Date().getFullYear()}`}
          value={formatEur(totalCommission)}
          icon={<TrendingUp size={18} />}
          tone="violet"
        />
      </div>

      {/* Detail table */}
      <div className="p-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
        <div className="overflow-x-auto">
        <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              {['Date', 'Prospect', 'Type', 'Devis HT', 'Commission 10%'].map(h => (
                <th key={h} style={{ textAlign: h === 'Devis HT' || h === 'Commission 10%' ? 'right' : 'left', padding: '12px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-500)', borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {signedLeads.map(l => (
              <tr key={l.id}>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--gray-100)', color: 'var(--gray-700)' }}>{l.signed_at || '—'}</td>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--gray-100)', fontWeight: 600, color: 'var(--gray-900)' }}>{l.name}</td>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--gray-100)', color: 'var(--gray-700)' }}>{l.work_type}</td>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--gray-100)', textAlign: 'right', color: 'var(--gray-900)' }}>{formatEur(l.signed_amount!)}</td>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--gray-100)', textAlign: 'right', fontWeight: 600, color: 'var(--violet-700)' }}>{formatEur(l.commission_amount || 0)}</td>
              </tr>
            ))}
            {signedLeads.length > 0 && (
              <tr style={{ background: 'var(--gray-50)' }}>
                <td colSpan={3} style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--gray-900)' }}>Total</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--gray-900)' }}>{formatEur(totalCa)}</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--violet-700)' }}>{formatEur(totalCommission)}</td>
              </tr>
            )}
            {signedLeads.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--gray-400)' }}>Aucun devis signé pour le moment</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Explainer accordion */}
      <div className="p-card" style={{ overflow: 'hidden' }}>
        <button
          onClick={() => setExplainerOpen(o => !o)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        >
          <Info size={18} style={{ color: 'var(--violet-600)', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--gray-900)' }}>Comment fonctionne la commission ?</span>
          <ChevronDown size={16} style={{ color: 'var(--gray-400)', transform: explainerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
        {explainerOpen && (
          <div style={{ padding: '0 20px 20px', display: 'grid', gap: 12 }}>
            {[
              ['1', 'Celexia vous génère des leads qualifiés via Google Ads.'],
              ['2', 'Vous décrochez, vendez et marquez le lead comme "signé" avec le montant du devis.'],
              ['3', 'Celexia prend 10% HT du montant signé comme commission.'],
              ['4', 'La facturation est mensuelle. Vous recevez un récap le 1er de chaque mois.'],
            ].map(([num, text]) => (
              <div key={num} style={{ display: 'flex', gap: 12 }}>
                <span style={{ width: 24, height: 24, borderRadius: 999, background: 'var(--violet-100)', color: 'var(--violet-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{num}</span>
                <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.5, margin: 0 }}>{text}</p>
              </div>
            ))}
            <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
              Note : la commission ne s'applique que sur les leads générés par Celexia (source Google Ads), pas sur les leads "bouche à oreille".
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
