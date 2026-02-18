import { useQuery } from '@tanstack/react-query'
import { getContracts, getContractStats } from '../services/contract-service'
import { STALE_TIME_LIST, STALE_TIME_DASHBOARD } from '@/lib/constants'

export function useContracts(commercialId?: string) {
  return useQuery({
    queryKey: ['contracts', commercialId],
    queryFn: () => getContracts(commercialId),
    staleTime: STALE_TIME_LIST,
  })
}

export function useContractStats(commercialId?: string) {
  return useQuery({
    queryKey: ['contracts', 'stats', commercialId],
    queryFn: () => getContractStats(commercialId),
    staleTime: STALE_TIME_DASHBOARD,
  })
}
