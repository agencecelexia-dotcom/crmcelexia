import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getRendezVous,
  getRdv,
  getRdvForProspect,
  createRdv,
  updateRdv,
  getMyUpcomingRdv,
  getMyRdvThisWeek,
  getRdvBySection,
  getRdvKpis,
  markRecallAttempt,
  cancelRdvWithReason,
  type RdvFilters,
  type RdvSection,
  type RecallResult,
} from '../services/rdv-service'
import type { RdvType } from '@/types/enums'
import { STALE_TIME_LIST } from '@/lib/constants'
import { toast } from 'sonner'

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
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
    onError: () => toast.error('Erreur lors de la création du RDV'),
  })
}

interface UpdateRdvParams {
  id: string
  prospect_id?: string
  updates: Partial<Pick<import('@/types').RendezVous, 'scheduled_at' | 'duration_minutes' | 'type' | 'status' | 'result' | 'location' | 'meeting_url' | 'notes' | 'no_show_reason'>>
}

export function useUpdateRdv() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: UpdateRdvParams) => updateRdv({ id: params.id, updates: params.updates }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rdv'] })
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      if (variables.prospect_id) {
        queryClient.invalidateQueries({ queryKey: ['prospect', variables.prospect_id] })
      }
    },
    onError: () => toast.error('Erreur lors de la mise à jour du RDV'),
  })
}

// ============================================================================
// Hooks pour la refonte page liste RDV (Chantier 2)
// ============================================================================

export function useRdvSection(section: RdvSection) {
  return useQuery({
    queryKey: ['rdv', 'section', section],
    queryFn: () => getRdvBySection(section),
    staleTime: 30_000,
  })
}

export function useRdvKpis() {
  return useQuery({
    queryKey: ['rdv', 'kpis'],
    queryFn: () => getRdvKpis(),
    staleTime: 60_000,
  })
}

export function useMarkRecallAttempt() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: { rdvId: string; result: RecallResult }) =>
      markRecallAttempt(params.rdvId, params.result),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rdv', 'section'] })
      queryClient.invalidateQueries({ queryKey: ['rdv', 'kpis'] })
      queryClient.invalidateQueries({ queryKey: ['rdv'] })
    },
    onError: () => toast.error('Erreur lors du marquage du rappel'),
  })
}

export function useCancelRdvWithReason() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: { rdvId: string; reason: string }) =>
      cancelRdvWithReason(params.rdvId, params.reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rdv', 'section'] })
      queryClient.invalidateQueries({ queryKey: ['rdv', 'kpis'] })
      queryClient.invalidateQueries({ queryKey: ['rdv'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
    onError: () => toast.error('Erreur lors de l\'annulation du RDV'),
  })
}
