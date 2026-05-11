import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getStepsForClient,
  markStepDone,
  markStepUndone,
  updateStepNotes,
  getAllClientsAccompagnement,
  getClientKpis,
} from '../services/accompagnement-service'
import { getPortalDocsForClient } from '../services/portal-docs-service'
import { STALE_TIME_LIST } from '@/lib/constants'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'

/** Récupère les paths des documents uploadés par l'artisan dans son portail.
 *  Utilisé dans le dialog de validation d'étape Accompagnement pour afficher
 *  un bouton "Voir le PDF" sur les étapes concernées. */
export function usePortalDocsForClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ['portal-docs', clientId],
    queryFn: () => getPortalDocsForClient(clientId!),
    enabled: !!clientId,
    staleTime: 30_000,
  })
}

export function useStepsForClient(clientId: string | undefined) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['accompagnement', clientId],
    queryFn: () => getStepsForClient(clientId!),
    enabled: !!clientId,
    staleTime: STALE_TIME_LIST,
  })

  // Realtime : le trigger sync_portal_to_accompagnement met à jour
  // client_accompagnement_steps quand l'artisan progresse côté portail.
  // On invalide la query React Query à chaque INSERT/UPDATE pour que
  // la page client se mette à jour en live, sans recharger.
  useEffect(() => {
    if (!clientId) return
    const channel = supabase
      .channel(`accomp-steps-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_accompagnement_steps',
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['accompagnement', clientId] })
          queryClient.invalidateQueries({ queryKey: ['accompagnement', 'all'] })
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [clientId, queryClient])

  return query
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
