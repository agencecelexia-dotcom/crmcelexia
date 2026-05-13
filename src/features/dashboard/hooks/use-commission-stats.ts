import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export interface AdminCommissionStats {
  /** Commissions encaissées ce mois (commission_status='paid' ET paid_at >= début du mois). */
  paidThisMonth: number
  /** Commissions générées ce mois (signed_at >= début du mois, peu importe paiement). */
  generatedThisMonth: number
  /** Commissions en attente toutes périodes confondues (pending + declared_paid + disputed). */
  pendingAllTime: number
  /** Nombre de validations en attente (commission_status='declared_paid' à valider par fondateur). */
  pendingValidations: number
}

/**
 * Stats commission agrégées CROSS-CLIENTS pour le dashboard founder.
 * Source unique : portal_leads.commission_*. Confidé aux fondateurs
 * (RLS portal_leads_admin_all les laisse tout voir via is_founder()).
 */
export function useAdminCommissionStats() {
  return useQuery({
    queryKey: ['admin', 'commission-stats'],
    queryFn: async (): Promise<AdminCommissionStats> => {
      const now = new Date()
      const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const { data, error } = await supabase
        .from('portal_leads')
        .select('commission_amount, commission_status, commission_paid_at, signed_at')
        .eq('status', 'signe')
        .is('deleted_at', null)
      if (error) throw error

      const leads = data ?? []
      let paidThisMonth = 0
      let generatedThisMonth = 0
      let pendingAllTime = 0
      let pendingValidations = 0
      for (const l of leads) {
        const amount = Number(l.commission_amount ?? 0)
        if (l.signed_at && l.signed_at >= monthStartIso.slice(0, 10)) {
          generatedThisMonth += amount
        }
        if (l.commission_status === 'paid' && l.commission_paid_at && l.commission_paid_at >= monthStartIso) {
          paidThisMonth += amount
        }
        if (l.commission_status === 'pending' || l.commission_status === 'declared_paid' || l.commission_status === 'disputed') {
          pendingAllTime += amount
        }
        if (l.commission_status === 'declared_paid') {
          pendingValidations += 1
        }
      }
      return { paidThisMonth, generatedThisMonth, pendingAllTime, pendingValidations }
    },
  })
}
