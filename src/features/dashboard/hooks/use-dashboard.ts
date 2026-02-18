import { useQuery } from '@tanstack/react-query'
import {
  getDashboardStats,
  getCommercialRanking,
} from '../services/dashboard-service'
import { STALE_TIME_DASHBOARD } from '@/lib/constants'

// Single hook that fetches ALL dashboard data in one RPC call
export function useDashboardStats(commercialId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'stats', commercialId],
    queryFn: () => getDashboardStats(commercialId),
    staleTime: STALE_TIME_DASHBOARD,
    retry: 1,
  })
}

// Only used in founder view — separate because it's 4 parallel queries
export function useCommercialRanking() {
  return useQuery({
    queryKey: ['dashboard', 'ranking'],
    queryFn: () => getCommercialRanking(),
    staleTime: STALE_TIME_DASHBOARD,
    retry: 1,
  })
}

// Derived hooks — all share the same query, no extra network calls
export function useFunnelStats(commercialId?: string) {
  const { data, ...rest } = useDashboardStats(commercialId)
  return { data: data?.funnel, ...rest }
}

export function useCallsToday(commercialId?: string) {
  const { data, ...rest } = useDashboardStats(commercialId)
  return { data: data?.calls_today, ...rest }
}

export function useCallsThisWeek(commercialId?: string) {
  const { data, ...rest } = useDashboardStats(commercialId)
  return { data: data?.calls_week, ...rest }
}

export function useRdvThisWeek(commercialId?: string) {
  const { data, ...rest } = useDashboardStats(commercialId)
  return { data: data?.rdv_week, ...rest }
}

export function useRdvShowUpRate(commercialId?: string) {
  const { data, ...rest } = useDashboardStats(commercialId)
  return { data: data?.show_up_rate, ...rest }
}

export function useRemindersCount(commercialId: string | undefined) {
  const { data, ...rest } = useDashboardStats(commercialId)
  return {
    data: data ? { today: data.reminders_today, overdue: data.reminders_overdue } : undefined,
    ...rest,
  }
}

export function useWeeklyCallStats(commercialId?: string) {
  const { data, ...rest } = useDashboardStats(commercialId)
  return { data: data?.weekly_calls, ...rest }
}
