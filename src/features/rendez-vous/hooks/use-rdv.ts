import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getRendezVous,
  getRdv,
  getRdvForProspect,
  createRdv,
  updateRdv,
  getMyUpcomingRdv,
  getMyRdvThisWeek,
  type RdvFilters,
} from '../services/rdv-service'
import type { RdvType } from '@/types/enums'
import { STALE_TIME_LIST } from '@/lib/constants'

interface UseRendezVousParams {
  filters?: RdvFilters
  page?: number
  pageSize?: number
  sortBy?: string
  sortDesc?: boolean
}

export function useRendezVous(params: UseRendezVousParams = {}) {
  return useQuery({
    queryKey: ['rdv', 'list', params],
    queryFn: () => getRendezVous(params),
    staleTime: STALE_TIME_LIST,
  })
}

export function useRdv(id: string | undefined) {
  return useQuery({
    queryKey: ['rdv', id],
    queryFn: () => getRdv(id!),
    enabled: !!id,
  })
}

export function useRdvForProspect(prospectId: string | undefined) {
  return useQuery({
    queryKey: ['rdv', 'prospect', prospectId],
    queryFn: () => getRdvForProspect(prospectId!),
    enabled: !!prospectId,
  })
}

export function useMyUpcomingRdv(commercialId: string | undefined) {
  return useQuery({
    queryKey: ['rdv', 'upcoming', commercialId],
    queryFn: () => getMyUpcomingRdv(commercialId!),
    enabled: !!commercialId,
    staleTime: 30_000,
  })
}

export function useMyRdvThisWeek(commercialId: string | undefined) {
  return useQuery({
    queryKey: ['rdv', 'week', commercialId],
    queryFn: () => getMyRdvThisWeek(commercialId!),
    enabled: !!commercialId,
    staleTime: 30_000,
  })
}

interface CreateRdvParams {
  prospect_id: string
  commercial_id: string
  scheduled_at: string
  duration_minutes: number
  type: RdvType
  location?: string | null
  meeting_url?: string | null
  notes?: string | null
  created_from_call_id?: string | null
}

export function useCreateRdv() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: CreateRdvParams) => createRdv(params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rdv'] })
      queryClient.invalidateQueries({ queryKey: ['prospect', variables.prospect_id] })
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

interface UpdateRdvParams {
  id: string
  updates: Partial<Pick<import('@/types').RendezVous, 'scheduled_at' | 'duration_minutes' | 'type' | 'status' | 'result' | 'location' | 'meeting_url' | 'notes' | 'no_show_reason'>>
}

export function useUpdateRdv() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: UpdateRdvParams) => updateRdv(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rdv'] })
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
