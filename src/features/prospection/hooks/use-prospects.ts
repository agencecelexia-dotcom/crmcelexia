import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getProspects,
  getProspect,
  createProspect,
  updateProspect,
  getDistinctProfessions,
  getDistinctCities,
} from '../services/prospect-service'
import type { Prospect, ProspectFilters } from '@/types'
import { STALE_TIME_LIST } from '@/lib/constants'

interface UseProspectsParams {
  filters?: ProspectFilters
  page?: number
  pageSize?: number
  sortBy?: string
  sortDesc?: boolean
}

export function useProspects(params: UseProspectsParams = {}) {
  return useQuery({
    queryKey: ['prospects', params],
    queryFn: () => getProspects(params),
    staleTime: STALE_TIME_LIST,
  })
}

export function useProspect(id: string | undefined) {
  return useQuery({
    queryKey: ['prospect', id],
    queryFn: () => getProspect(id!),
    enabled: !!id,
  })
}

export function useCreateProspect() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (prospect: Partial<Prospect>) => createProspect(prospect),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
    },
  })
}

export function useUpdateProspect() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Prospect> }) =>
      updateProspect(id, updates),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
      queryClient.invalidateQueries({ queryKey: ['prospect', variables.id] })
    },
  })
}

export function useProfessions() {
  return useQuery({
    queryKey: ['prospects', 'professions'],
    queryFn: getDistinctProfessions,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCities() {
  return useQuery({
    queryKey: ['prospects', 'cities'],
    queryFn: getDistinctCities,
    staleTime: 5 * 60 * 1000,
  })
}
