import { useQuery } from '@tanstack/react-query'
import { getCalendarEvents } from '../services/calendar-service'
import { STALE_TIME_DASHBOARD } from '@/lib/constants'

export function useCalendarEvents(startDate: string, endDate: string, commercialId?: string) {
  return useQuery({
    queryKey: ['calendar', 'events', startDate, endDate, commercialId],
    queryFn: () => getCalendarEvents(startDate, endDate, commercialId),
    staleTime: STALE_TIME_DASHBOARD,
    enabled: !!startDate && !!endDate,
  })
}
