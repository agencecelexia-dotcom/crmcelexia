import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export interface RoiStats {
  /** CA signé sur la fenêtre (somme des signed_amount). */
  ca_signed: number
  /** Commission Celexia sur la fenêtre. */
  commission_celexia: number
  /** ROI = CA / commission. NaN si commission = 0. */
  roi: number
  period_label: string
}

/**
 * Calcule la commission Celexia vs le CA signé sur les 30 derniers jours.
 * Source : portal_leads signés (lsa uniquement — les BAO ne génèrent pas
 * de commission Celexia, donc ils fausseraient le ROI).
 */
export function useRoiStats(clientId: string | undefined) {
  return useQuery({
    queryKey: ['roi-stats', clientId],
    queryFn: async (): Promise<RoiStats> => {
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const sinceIso = since.toISOString().slice(0, 10)

      const { data, error } = await supabase
        .from('portal_leads')
        .select('signed_amount, commission_amount')
        .eq('client_id', clientId!)
        .eq('status', 'signe')
        .eq('source', 'lsa')
        .gte('signed_at', sinceIso)
        .is('deleted_at', null)
      if (error) throw error

      let ca = 0
      let commission = 0
      for (const row of data ?? []) {
        ca += Number(row.signed_amount ?? 0)
        commission += Number(row.commission_amount ?? 0)
      }
      return {
        ca_signed: ca,
        commission_celexia: commission,
        roi: commission > 0 ? ca / commission : NaN,
        period_label: '30 derniers jours',
      }
    },
    enabled: !!clientId,
  })
}
