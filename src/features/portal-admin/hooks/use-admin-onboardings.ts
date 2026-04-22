import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPendingOnboardings, getAllOnboardings,
  validateOnboarding, rejectOnboarding, toggleReminders,
  type OnboardingStepKey,
} from '../services/admin-onboarding-service'
import { toast } from 'sonner'

export function usePendingOnboardings() {
  return useQuery({
    queryKey: ['admin-onboardings', 'pending'],
    queryFn: getPendingOnboardings,
    staleTime: 30_000,
  })
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
