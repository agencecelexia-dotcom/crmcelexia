import { useQuery } from '@tanstack/react-query'
import {
  getUpcomingRdvs,
  getPastUnconvertedRdvs,
  getSignedClients,
  getRdvCountThisMonth,
  getSignedCountThisMonth,
  getCallCounts,
  getConversionRate,
} from '../services/pipeline-service'
import { STALE_TIME_LIST } from '@/lib/constants'

export function useUpcomingRdvs(commercialId?: string) {
  return useQuery({
    queryKey: ['pipeline', 'upcoming-rdvs', commercialId],
    queryFn: () => getUpcomingRdvs(commercialId),
    staleTime: STALE_TIME_LIST,
  })
}

export function usePastUnconvertedRdvs(commercialId?: string) {
  return useQuery({
    queryKey: ['pipeline', 'past-unconverted', commercialId],
    queryFn: () => getPastUnconvertedRdvs(commercialId),
    staleTime: STALE_TIME_LIST,
  })
}

export function useSignedClients(commercialId?: string) {
  return useQuery({
    queryKey: ['pipeline', 'signed-clients', commercialId],
    queryFn: () => getSignedClients(commercialId),
    staleTime: STALE_TIME_LIST,
  })
}

export function useRdvCountThisMonth(commercialId?: string) {
  return useQuery({
    queryKey: ['pipeline', 'rdv-count-month', commercialId],
    queryFn: () => getRdvCountThisMonth(commercialId),
    staleTime: STALE_TIME_LIST,
  })
}

export function useSignedCountThisMonth(commercialId?: string) {
  return useQuery({
    queryKey: ['pipeline', 'signed-count-month', commercialId],
    queryFn: () => getSignedCountThisMonth(commercialId),
    staleTime: STALE_TIME_LIST,
  })
}

export function useCallCounts(commercialId?: string) {
  return useQuery({
    queryKey: ['pipeline', 'call-counts', commercialId],
    queryFn: () => getCallCounts(commercialId),
    staleTime: STALE_TIME_LIST,
  })
}

export function useConversionRate(commercialId?: string) {
  return useQuery({
    queryKey: ['pipeline', 'conversion-rate', commercialId],
    queryFn: () => getConversionRate(commercialId),
    staleTime: STALE_TIME_LIST,
  })
}
