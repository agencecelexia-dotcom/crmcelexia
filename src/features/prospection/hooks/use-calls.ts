import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { logCall, getCallsForProspect, getMyCallsToday } from '../services/call-service'
import type { CallResult, ProspectStatus } from '@/types/enums'

interface LogCallParams {
  prospect_id: string
  commercial_id: string
  result: CallResult
  new_status: ProspectStatus
  note?: string | null
  duration_seconds?: number | null
}

export function useCallsForProspect(prospectId: string | undefined) {
  return useQuery({
    queryKey: ['calls', 'prospect', prospectId],
    queryFn: () => getCallsForProspect(prospectId!),
    enabled: !!prospectId,
  })
}

export function useMyCallsToday(commercialId: string | undefined) {
  return useQuery({
    queryKey: ['calls', 'today', commercialId],
    queryFn: () => getMyCallsToday(commercialId!),
    enabled: !!commercialId,
    staleTime: 30_000,
  })
}

export function useLogCall() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: LogCallParams) => logCall(params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
      queryClient.invalidateQueries({ queryKey: ['prospect', variables.prospect_id] })
      queryClient.invalidateQueries({ queryKey: ['calls', 'prospect', variables.prospect_id] })
      queryClient.invalidateQueries({ queryKey: ['calls', 'today'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
