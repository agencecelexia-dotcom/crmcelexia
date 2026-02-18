import { useQuery } from '@tanstack/react-query'
import {
  getPerformanceStats,
  getKeyRates,
  getCommercialClosingRates,
  getLossReasonStats,
} from '../services/analytics-service'
import { STALE_TIME_DASHBOARD } from '@/lib/constants'

export function usePerformanceStats(commercialId?: string) {
  return useQuery({
    queryKey: ['analytics', 'performance', commercialId],
    queryFn: () => getPerformanceStats(commercialId),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useKeyRates(commercialId?: string) {
  return useQuery({
    queryKey: ['analytics', 'key-rates', commercialId],
    queryFn: () => getKeyRates(commercialId),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useCommercialClosingRates() {
  return useQuery({
    queryKey: ['analytics', 'closing-rates'],
    queryFn: () => getCommercialClosingRates(),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useLossReasonStats(commercialId?: string) {
  return useQuery({
    queryKey: ['analytics', 'loss-reasons', commercialId],
    queryFn: () => getLossReasonStats(commercialId),
    staleTime: STALE_TIME_DASHBOARD,
  })
}
