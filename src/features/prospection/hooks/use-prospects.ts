import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getProspects,
  getProspect,
  createProspect,
  updateProspect,
  getDistinctProfessions,
  getDistinctCities,
  deleteProspects,
  assignProspects,
  assignProspectsSplit,
} from '../services/prospect-service'
import { supabase } from '@/lib/supabase/client'
import type { Prospect, ProspectFilters } from '@/types'
import { STALE_TIME_LIST } from '@/lib/constants'
import { toast } from 'sonner'

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
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: () => toast.error('Erreur lors de la création du prospect'),
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
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: () => toast.error('Erreur lors de la mise à jour du prospect'),
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

export function useDeleteProspects() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => deleteProspects(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Prospects supprimés')
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  })
}

export function useAssignProspects() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, commercialId }: { ids: string[]; commercialId: string }) =>
      assignProspects(ids, commercialId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Prospects réassignés')
    },
    onError: () => toast.error('Erreur lors de la réassignation'),
  })
}

export function useAssignProspectsSplit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, assignments }: { ids: string[]; assignments: { commercial_id: string; percentage: number }[] }) =>
      assignProspectsSplit(ids, assignments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Prospects répartis entre les commerciaux')
    },
    onError: () => toast.error('Erreur lors de la répartition'),
  })
}

export function useTeamMembers() {
  return useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, email')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('full_name')
      if (error) throw error
      return data as { id: string; full_name: string; role: string; email: string }[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
