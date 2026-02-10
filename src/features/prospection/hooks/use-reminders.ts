import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createReminder,
  getRemindersForProspect,
  getMyReminders,
  completeReminder,
} from '../services/reminder-service'

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
    },
  })
}

export function useCompleteReminder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => completeReminder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
    },
  })
}
