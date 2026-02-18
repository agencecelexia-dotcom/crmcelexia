import { useQuery } from '@tanstack/react-query'
import { getPayments, getPaymentStats } from '../services/payment-service'
import { STALE_TIME_LIST, STALE_TIME_DASHBOARD } from '@/lib/constants'
import type { PaymentStatus } from '@/types/enums'

export function usePayments(filters?: { status?: PaymentStatus[]; commercialId?: string }) {
  return useQuery({
    queryKey: ['payments', filters],
    queryFn: () => getPayments(filters),
    staleTime: STALE_TIME_LIST,
  })
}

export function usePaymentStats(commercialId?: string) {
  return useQuery({
    queryKey: ['payments', 'stats', commercialId],
    queryFn: () => getPaymentStats(commercialId),
    staleTime: STALE_TIME_DASHBOARD,
  })
}
