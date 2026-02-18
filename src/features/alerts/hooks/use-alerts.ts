import { useQuery } from '@tanstack/react-query'
import { getSmartAlerts } from '../services/alert-service'
import { STALE_TIME_DASHBOARD } from '@/lib/constants'

export function useSmartAlerts(commercialId?: string) {
  return useQuery({
    queryKey: ['alerts', 'smart', commercialId],
    queryFn: () => getSmartAlerts(commercialId),
    staleTime: STALE_TIME_DASHBOARD,
  })
}
