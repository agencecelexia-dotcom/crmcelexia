import { supabase } from '@/lib/supabase/client'
import type { Call } from '@/types'
import type { CallResult, ProspectStatus } from '@/types/enums'

interface LogCallParams {
  prospect_id: string
  commercial_id: string
  result: CallResult
  new_status: ProspectStatus
  note?: string | null
  duration_seconds?: number | null
}

export async function logCall(params: LogCallParams): Promise<string> {
  const { data, error } = await supabase.rpc('log_call_and_update_prospect', {
    p_prospect_id: params.prospect_id,
    p_commercial_id: params.commercial_id,
    p_result: params.result,
    p_new_status: params.new_status,
    p_note: params.note ?? null,
    p_duration_seconds: params.duration_seconds ?? null,
  })

  if (error) throw error
  return data as string
}

export async function getCallsForProspect(prospectId: string): Promise<Call[]> {
  const { data, error } = await supabase
    .from('calls')
    .select('*, commercial:profiles!calls_commercial_id_fkey(id, full_name)')
    .eq('prospect_id', prospectId)
    .order('called_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as Call[]
}

export async function getMyCallsToday(commercialId: string): Promise<Call[]> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('calls')
    .select('*, prospect:prospects!calls_prospect_id_fkey(id, company_name, phone)')
    .eq('commercial_id', commercialId)
    .gte('called_at', today.toISOString())
    .order('called_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as Call[]
}
