import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getStepsForClient,
  markStepDone,
  markStepUndone,
  updateStepNotes,
  getAllClientsAccompagnement,
  getClientKpis,
} from '../services/accompagnement-service'
import { STALE_TIME_LIST } from '@/lib/constants'
import { toast } from 'sonner'

export function useStepsForClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ['accompagnement', clientId],
    queryFn: () => getStepsForClient(clientId!),
    enabled: !!clientId,
    staleTime: STALE_TIME_LIST,
  })
}

export function useAllClientsAccompagnement() {
  return useQuery({
    queryKey: ['accompagnement', 'all'],
    queryFn: getAllClientsAccompagnement,
    staleTime: STALE_TIME_LIST,
  })
}

export function useMarkStepDone() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      stepId,
      validatedBy,
    }: {
      stepId: string
      validatedBy: string
      clientId: string
    }) => markStepDone(stepId, validatedBy),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['accompagnement', variables.clientId] })
      queryClient.invalidateQueries({ queryKey: ['accompagnement', 'all'] })
    },
    onError: (err: Error) => {
      toast.error(`Erreur: ${err.message}`)
    },
  })
}

export function useMarkStepUndone() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ stepId }: { stepId: string; clientId: string }) => markStepUndone(stepId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['accompagnement', variables.clientId] })
      queryClient.invalidateQueries({ queryKey: ['accompagnement', 'all'] })
    },
    onError: (err: Error) => {
      toast.error(`Erreur: ${err.message}`)
    },
  })
}

export function useUpdateStepNotes() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      stepId,
      notes,
      resourceUrl,
    }: {
      stepId: string
      notes: string | null
      resourceUrl?: string | null
      clientId: string
    }) => updateStepNotes(stepId, notes, resourceUrl),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['accompagnement', variables.clientId] })
      queryClient.invalidateQueries({ queryKey: ['accompagnement', 'all'] })
    },
    onError: (err: Error) => {
      toast.error(`Erreur: ${err.message}`)
    },
  })
}

export function useClientKpis(clientId: string | undefined) {
  return useQuery({
    queryKey: ['accompagnement', 'kpis', clientId],
    queryFn: () => getClientKpis(clientId!),
    enabled: !!clientId,
    staleTime: STALE_TIME_LIST,
  })
}
