import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPerformanceStats,
  getKeyRates,
  getCommercialClosingRates,
  getLossReasonStats,
  getCallHeatmapData,
  getPerformanceByNiche,
  getCATrend,
  getObjectives,
  saveObjectives,
  getDashboardComparisons,
  getDSOStats,
  getCommercialPerformanceRanking,
  getCommercialDetail,
} from '../services/analytics-service'
import type { ObjectiveValues } from '../services/analytics-service'
import { STALE_TIME_DASHBOARD } from '@/lib/constants'

export function usePerformanceStats(commercialId?: string) {
  return useQuery({
    queryKey: ['analytics', 'performance', commercialId],
    queryFn: () => getPerformanceStats(commercialId),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useKeyRates(commercialId?: string) {
  return useQuery({
    queryKey: ['analytics', 'key-rates', commercialId],
    queryFn: () => getKeyRates(commercialId),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useCommercialClosingRates() {
  return useQuery({
    queryKey: ['analytics', 'closing-rates'],
    queryFn: () => getCommercialClosingRates(),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useLossReasonStats(commercialId?: string) {
  return useQuery({
    queryKey: ['analytics', 'loss-reasons', commercialId],
    queryFn: () => getLossReasonStats(commercialId),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useCallHeatmap(commercialId?: string) {
  return useQuery({
    queryKey: ['analytics', 'call-heatmap', commercialId],
    queryFn: () => getCallHeatmapData(commercialId),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function usePerformanceByNiche(commercialId?: string) {
  return useQuery({
    queryKey: ['analytics', 'niche-performance', commercialId],
    queryFn: () => getPerformanceByNiche(commercialId),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useCATrend(commercialId?: string) {
  return useQuery({
    queryKey: ['analytics', 'ca-trend', commercialId],
    queryFn: () => getCATrend(commercialId),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useObjectives(commercialId: string | undefined) {
  return useQuery({
    queryKey: ['analytics', 'objectives', commercialId],
    queryFn: () => getObjectives(commercialId!),
    enabled: !!commercialId,
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useSaveObjectives() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ commercialId, objectives }: { commercialId: string; objectives: ObjectiveValues }) =>
      saveObjectives(commercialId, objectives),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['analytics', 'objectives', variables.commercialId] })
    },
  })
}

export function useDashboardComparisons(commercialId?: string) {
  return useQuery({
    queryKey: ['analytics', 'dashboard-comparisons', commercialId],
    queryFn: () => getDashboardComparisons(commercialId),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useDSOStats() {
  return useQuery({
    queryKey: ['analytics', 'dso'],
    queryFn: () => getDSOStats(),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useCommercialPerformanceRanking() {
  return useQuery({
    queryKey: ['analytics', 'commercial-performance-ranking'],
    queryFn: () => getCommercialPerformanceRanking(),
    staleTime: STALE_TIME_DASHBOARD,
  })
}

export function useCommercialDetail(commercialId: string | null) {
  return useQuery({
    queryKey: ['analytics', 'commercial-detail', commercialId],
    queryFn: () => getCommercialDetail(commercialId!),
    enabled: !!commercialId,
    staleTime: STALE_TIME_DASHBOARD,
  })
}
