import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCalendarEvents, createManualEvent, deleteManualEvent } from '../services/calendar-service'
import type { CreateManualEventInput } from '../services/calendar-service'
import { STALE_TIME_DASHBOARD } from '@/lib/constants'

export function useCalendarEvents(startDate: string, endDate: string, commercialId?: string) {
  return useQuery({
    queryKey: ['calendar', 'events', startDate, endDate, commercialId],
    queryFn: () => getCalendarEvents(startDate, endDate, commercialId),
    staleTime: STALE_TIME_DASHBOARD,
    enabled: !!startDate && !!endDate,
  })
}

export function useCreateCalendarEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateManualEventInput) => createManualEvent(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}

export function useDeleteCalendarEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteManualEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}
