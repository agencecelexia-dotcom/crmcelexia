import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createReminder,
  getRemindersForProspect,
  getMyReminders,
  completeReminder,
} from '../services/reminder-service'
import { toast } from 'sonner'

interface CreateReminderParams {
  prospect_id: string
  commercial_id: string
  remind_at: string
  note?: string | null
}

export function useRemindersForProspect(prospectId: string | undefined) {
  return useQuery({
    queryKey: ['reminders', 'prospect', prospectId],
    queryFn: () => getRemindersForProspect(prospectId!),
    enabled: !!prospectId,
  })
}

export function useMyReminders(commercialId: string | undefined, options?: {
  todayOnly?: boolean
  overdueOnly?: boolean
}) {
  return useQuery({
    queryKey: ['reminders', 'my', commercialId, options],
    queryFn: () => getMyReminders(commercialId!, options),
    enabled: !!commercialId,
    staleTime: 30_000,
  })
}

export function useCreateReminder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: CreateReminderParams) => createReminder(params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      queryClient.invalidateQueries({ queryKey: ['prospect', variables.prospect_id] })
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
    onError: () => toast.error('Erreur lors de la création du rappel'),
  })
}

export function useCompleteReminder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id }: { id: string; prospectId?: string }) => completeReminder(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      if (variables.prospectId) {
        queryClient.invalidateQueries({ queryKey: ['prospect', variables.prospectId] })
      }
    },
    onError: () => toast.error('Erreur lors de la complétion du rappel'),
  })
}
