import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { usePortalLeads, usePortalLeadStats, useDeclareCommissionPaid } from '../hooks/use-portal-leads'
import { Euro, CheckCircle2, TrendingUp, Info, ChevronDown, Clock, AlertCircle } from 'lucide-react'
import { PortalKpiCard } from '../components/portal-kpi-card'
import { formatEur, getCommissionTerms, formatCommissionTerms } from '../lib/format'
import { supabase } from '@/lib/supabase/client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { PortalLead } from '@/types'

export function PortalCommissionPage() {
  const { client } = usePortalAuth()
  const qc = useQueryClient()
  const { data: leads } = usePortalLeads(client?.id)
  const { data: stats } = usePortalLeadStats(client?.id)
  const declarePaid = useDeclareCommissionPaid()
  const [explainerOpen, setExplainerOpen] = useState(false)
  const [confirmLead, setConfirmLead] = useState<PortalLead | null>(null)

  // Realtime subscription : quand le fondateur valide/refuse une commission
  // côté admin, l'artisan voit le changement instantanément (KPI + badge)
  // sans avoir à F5. Complète l'invalidation explicite des mutations locales
  // (commit 6e255f3) en couvrant aussi les mutations *distantes*.
  useEffect(() => {
    if (!client?.id) return
    const channel = supabase
      .channel(`commission-${client.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'portal_leads', filter: `client_id=eq.${client.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ['portal-leads', client.id] })
          qc.invalidateQueries({ queryKey: ['portal-lead-stats', client.id] })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [client?.id, qc])

  const signedLeads = (leads ?? []).filter(l => l.status === 'signe' && l.signed_amount)
  const totalCa = stats?.total_ca || 0
  const totalCommission = stats?.total_commission || 0
  const terms = getCommissionTerms(client)
  const termsLabel = formatCommissionTerms(terms)

  return (
    <div>
      <h1 className="font-display mb-4 text-xl font-bold sm:mb-5 sm:text-2xl md:text-[26px]">Commission</h1>

      {/* KPI row */}
      <div className="mb-5 grid grid-cols-1 gap-2.5 sm:mb-7 sm:grid-cols-3 sm:gap-4">
        {/* Commission card — violet bg */}
        <div
          className="p-4 sm:p-5"
          style={{
            background: 'linear-gradient(135deg, var(--violet-600), var(--violet-700))',
            color: 'white', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-violet)',
          }}
        >
          <Euro size={18} className="mb-1.5 opacity-80" />
          <div className="text-[11px] font-medium opacity-85 sm:text-xs">Reste à payer ce mois</div>
          <div className="font-display mt-0.5 text-2xl font-bold sm:text-[28px]">{formatEur(stats?.commission_remaining_this_month || 0)} {terms.base}</div>
          {stats?.commission_this_month && stats.commission_remaining_this_month !== stats.commission_this_month && (
            <div className="mt-1 text-[10px] opacity-75 sm:text-[11px]">
              sur {formatEur(stats.commission_this_month)} total · le reste est déjà déclaré payé
            </div>
          )}
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
              {['Date', 'Prospect', 'Type', `Devis ${terms.base}`, `Commission ${termsLabel}`, 'Statut'].map(h => (
                <th key={h} style={{ textAlign: h.startsWith('Devis') || h.startsWith('Commission') ? 'right' : 'left', padding: '12px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-500)', borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)' }}>{h}</th>
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
                <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--gray-100)' }}>
                  <CommissionStatusCell lead={l} onDeclare={() => setConfirmLead(l)} />
                </td>
              </tr>
            ))}
            {signedLeads.length > 0 && (
              <tr style={{ background: 'var(--gray-50)' }}>
                <td colSpan={3} style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--gray-900)' }}>Total</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--gray-900)' }}>{formatEur(totalCa)}</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--violet-700)' }}>{formatEur(totalCommission)}</td>
                <td style={{ padding: '14px 16px' }} />
              </tr>
            )}
            {signedLeads.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--gray-400)' }}>Aucun devis signé pour le moment</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Confirmation paiement commission */}
      <AlertDialog open={!!confirmLead} onOpenChange={(open) => !open && setConfirmLead(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le paiement de la commission&nbsp;?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous déclarez avoir viré <strong>{formatEur(confirmLead?.commission_amount ?? 0)}</strong> à
              Celexia pour le lead <strong>{confirmLead?.name}</strong>.
              L'équipe Celexia validera votre déclaration sous quelques jours après vérification du virement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmLead) return
                declarePaid.mutate(confirmLead.id)
                setConfirmLead(null)
              }}
            >
              J'ai payé
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              ['1', 'Celexia vous génère des leads qualifiés.'],
              ['2', 'Vous décrochez, vendez et marquez le lead comme "signé" avec le montant du devis.'],
              ['3', `Celexia prend ${termsLabel} du montant signé comme commission (conformément à votre contrat).`],
              ['4', 'La facturation est mensuelle. Vous recevez un récap le 1er de chaque mois.'],
            ].map(([num, text]) => (
              <div key={num} style={{ display: 'flex', gap: 12 }}>
                <span style={{ width: 24, height: 24, borderRadius: 999, background: 'var(--violet-100)', color: 'var(--violet-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{num}</span>
                <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.5, margin: 0 }}>{text}</p>
              </div>
            ))}
            <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
              Note : la commission ne s'applique que sur les leads générés par Celexia, pas sur les leads "bouche à oreille".
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function CommissionStatusCell({ lead, onDeclare }: { lead: PortalLead; onDeclare: () => void }) {
  switch (lead.commission_status) {
    case 'paid':
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'var(--emerald-100)', color: 'var(--emerald-700)', fontSize: 12, fontWeight: 600 }}>
          <CheckCircle2 size={13} /> Payée{lead.commission_paid_at ? ` le ${new Date(lead.commission_paid_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}` : ''}
        </div>
      )
    case 'declared_paid':
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: '#FEF3C7', color: '#92400E', fontSize: 12, fontWeight: 600 }}>
          <Clock size={13} /> En attente de validation
        </div>
      )
    case 'disputed':
      return (
        <div
          title={lead.commission_admin_notes ?? 'À clarifier — contactez Celexia.'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: '#FEE2E2', color: '#991B1B', fontSize: 12, fontWeight: 600, cursor: 'help' }}
        >
          <AlertCircle size={13} /> À clarifier
        </div>
      )
    case 'pending':
    default:
      return (
        <button
          type="button"
          onClick={onDeclare}
          className="btn btn-primary"
          style={{ padding: '6px 12px', fontSize: 12, minHeight: 32 }}
        >
          J'ai payé
        </button>
      )
  }
}
