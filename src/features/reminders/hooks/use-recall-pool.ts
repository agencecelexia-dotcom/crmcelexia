import { useQuery } from '@tanstack/react-query'
import { getNoShowRdvsToRecall, getForgottenProspects } from '../services/recall-pool-service'

export function useNoShowRdvsToRecall() {
  return useQuery({
    queryKey: ['recall-pool', 'no-show-rdvs'],
    queryFn: getNoShowRdvsToRecall,
    staleTime: 60_000,
  })
}

export function useForgottenProspects(limit = 100) {
  return useQuery({
    queryKey: ['recall-pool', 'forgotten-prospects', limit],
    queryFn: () => getForgottenProspects(limit),
    staleTime: 60_000,
  })
}
