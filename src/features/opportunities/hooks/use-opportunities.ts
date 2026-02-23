import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getOpportunities,
  getOpportunity,
  getOpportunitiesForKanban,
  getOpportunitiesForClient,
  createOpportunity,
  updateOpportunity,
  updateOpportunityStatus,
  getPipelineStats,
  type OpportunityFilters,
} from '../services/opportunity-service'
import type { Opportunity } from '@/types'
import type { OpportunityStatus } from '@/types/enums'
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

export function useOpportunitiesKanban(commercialId?: string) {
  return useQuery({
    queryKey: ['opportunities', 'kanban', commercialId],
    queryFn: () => getOpportunitiesForKanban(commercialId),
    staleTime: STALE_TIME_LIST,
  })
}

export function useOpportunitiesForClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ['opportunities', 'client', clientId],
    queryFn: () => getOpportunitiesForClient(clientId!),
    enabled: !!clientId,
    staleTime: STALE_TIME_LIST,
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
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Opportunity> }) =>
      updateOpportunity(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      qc.invalidateQueries({ queryKey: ['pipeline'] })
      toast.success('Opportunité mise à jour')
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useUpdateOpportunityStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, extra }: {
      id: string
      status: OpportunityStatus
      extra?: { loss_reason?: string; loss_notes?: string }
    }) => updateOpportunityStatus(id, status, extra),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['opportunities', 'kanban'] })
      const prev = qc.getQueriesData<Opportunity[]>({ queryKey: ['opportunities', 'kanban'] })
      qc.setQueriesData<Opportunity[]>(
        { queryKey: ['opportunities', 'kanban'] },
        (old) => old?.map(o => o.id === id ? { ...o, status } : o),
      )
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        for (const [key, data] of context.prev) {
          qc.setQueryData(key, data)
        }
      }
      toast.error('Erreur lors du changement de statut')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      qc.invalidateQueries({ queryKey: ['pipeline'] })
    },
    onSuccess: () => {
      toast.success('Statut mis à jour')
    },
  })
}

export function usePipelineStats(commercialId?: string) {
  return useQuery({
    queryKey: ['pipeline', 'stats', commercialId],
    queryFn: () => getPipelineStats(commercialId),
    staleTime: STALE_TIME_DASHBOARD,
  })
}
