import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPendingOnboardings, getAllOnboardings, getOnboardingByClientId,
  validateOnboarding, rejectOnboarding, toggleReminders,
  type OnboardingStepKey,
} from '../services/admin-onboarding-service'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'

export function usePendingOnboardings() {
  return useQuery({
    queryKey: ['admin-onboardings', 'pending'],
    queryFn: getPendingOnboardings,
    staleTime: 30_000,
  })
}

export function useClientOnboarding(clientId: string | undefined) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['admin-onboarding', 'client', clientId],
    queryFn: () => getOnboardingByClientId(clientId!),
    enabled: !!clientId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })

  // Realtime : invalide la query dès que l'artisan progresse dans son onboarding
  // → la page admin se met à jour en live, pas besoin de recharger.
  useEffect(() => {
    if (!clientId) return
    const channel = supabase
      .channel(`portal-onboarding-${clientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'portal_onboardings', filter: `client_id=eq.${clientId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['admin-onboarding', 'client', clientId] })
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [clientId, qc])

  return query
}

export function useAllOnboardings() {
  return useQuery({
    queryKey: ['admin-onboardings', 'all'],
    queryFn: getAllOnboardings,
    staleTime: 30_000,
  })
}

export function useValidateOnboarding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, validatedBy }: { id: string; validatedBy: string }) =>
      validateOnboarding(id, validatedBy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-onboardings'] })
      toast.success('Onboarding validé !')
    },
    onError: () => toast.error('Erreur lors de la validation'),
  })
}

export function useRejectOnboarding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason, stepsToReset }: { id: string; reason: string; stepsToReset: OnboardingStepKey[] }) =>
      rejectOnboarding(id, reason, stepsToReset),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-onboardings'] })
      toast.success('Corrections demandées')
    },
    onError: () => toast.error('Erreur'),
  })
}

export function useToggleReminders() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) =>
      toggleReminders(id, disabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-onboardings'] })
    },
  })
}
