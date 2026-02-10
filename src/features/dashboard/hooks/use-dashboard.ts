import { useQuery } from '@tanstack/react-query'
import {
  getFunnelStats,
  getCallsCount,
  getRdvCount,
  getRemindersCount,
  getCommercialRanking,
  getWeeklyCallStats,
} from '../services/dashboard-service'
import { STALE_TIME_DASHBOARD } from '@/lib/constants'

function getDateRanges() {
  const now = new Date()

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(todayStart)
  todayEnd.setDate(todayEnd.getDate() + 1)

  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay() + 1) // Monday
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 7)

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  return {
    todayStart: todayStart.toISOString(),
    todayEnd: todayEnd.toISOString(),
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    monthStart: monthStart.toISOString(),
    monthEnd: monthEnd.toISOString(),
  }
}

export function useFunnelStats(commercialId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'funnel', commercialId],
    queryFn: () => getFunnelStats(commercialId),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useCallsToday(commercialId?: string) {
  const { todayStart, todayEnd } = getDateRanges()
  return useQuery({
    queryKey: ['dashboard', 'calls-today', commercialId],
    queryFn: () => getCallsCount({ commercialId, dateFrom: todayStart, dateTo: todayEnd }),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useCallsThisWeek(commercialId?: string) {
  const { weekStart, weekEnd } = getDateRanges()
  return useQuery({
    queryKey: ['dashboard', 'calls-week', commercialId],
    queryFn: () => getCallsCount({ commercialId, dateFrom: weekStart, dateTo: weekEnd }),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useRdvThisWeek(commercialId?: string) {
  const { weekStart, weekEnd } = getDateRanges()
  return useQuery({
    queryKey: ['dashboard', 'rdv-week', commercialId],
    queryFn: () => getRdvCount({ commercialId, dateFrom: weekStart, dateTo: weekEnd }),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useRdvShowUpRate(commercialId?: string) {
  const { monthStart, monthEnd } = getDateRanges()
  return useQuery({
    queryKey: ['dashboard', 'showup', commercialId],
    queryFn: async () => {
      const [total, noShow] = await Promise.all([
        getRdvCount({ commercialId, dateFrom: monthStart, dateTo: monthEnd }),
        getRdvCount({ commercialId, dateFrom: monthStart, dateTo: monthEnd, status: 'no_show' }),
      ])
      if (total === 0) return 100
      return Math.round(((total - noShow) / total) * 100)
    },
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useRemindersCount(commercialId: string | undefined) {
  return useQuery({
    queryKey: ['dashboard', 'reminders', commercialId],
    queryFn: () => getRemindersCount(commercialId!),
    enabled: !!commercialId,
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useCommercialRanking() {
  const { monthStart, monthEnd } = getDateRanges()
  return useQuery({
    queryKey: ['dashboard', 'ranking'],
    queryFn: () => getCommercialRanking(monthStart, monthEnd),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useWeeklyCallStats(commercialId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'weekly-calls', commercialId],
    queryFn: () => getWeeklyCallStats({ commercialId }),
    staleTime: STALE_TIME_DASHBOARD,
  })
}
