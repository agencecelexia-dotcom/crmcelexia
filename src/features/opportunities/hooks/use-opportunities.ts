import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getOpportunities,
  getOpportunity,
  createOpportunity,
  updateOpportunity,
  getPipelineStats,
  type OpportunityFilters,
} from '../services/opportunity-service'
import { STALE_TIME_LIST, STALE_TIME_DASHBOARD } from '@/lib/constants'
import { toast } from 'sonner'

export function useOpportunities(filters?: OpportunityFilters, page = 1) {
  return useQuery({
    queryKey: ['opportunities', filters, page],
    queryFn: () => getOpportunities({ filters, page }),
    staleTime: STALE_TIME_LIST,
  })
}

export function useOpportunity(id: string | undefined) {
  return useQuery({
    queryKey: ['opportunities', id],
    queryFn: () => getOpportunity(id!),
    staleTime: STALE_TIME_LIST,
    enabled: !!id,
  })
}

export function useCreateOpportunity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createOpportunity,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      qc.invalidateQueries({ queryKey: ['pipeline'] })
      toast.success('Opportunité créée')
    },
    onError: () => toast.error('Erreur lors de la création'),
  })
}

export function useUpdateOpportunity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updateOpportunity>[1] }) =>
      updateOpportunity(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      qc.invalidateQueries({ queryKey: ['pipeline'] })
      toast.success('Opportunité mise à jour')
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function usePipelineStats(commercialId?: string, serviceType?: string) {
  return useQuery({
    queryKey: ['pipeline', 'stats', commercialId, serviceType],
    queryFn: () => getPipelineStats(commercialId, serviceType as 'site_web' | 'pub' | undefined),
    staleTime: STALE_TIME_DASHBOARD,
  })
}
