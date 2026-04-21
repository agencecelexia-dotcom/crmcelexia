import { supabase } from '@/lib/supabase/client'
import type { PortalOnboarding } from '../hooks/use-portal-auth'

export async function getOnboarding(clientId: string): Promise<PortalOnboarding | null> {
  const { data, error } = await supabase
    .from('portal_onboardings')
    .select('*')
    .eq('client_id', clientId)
    .single()
  if (error) return null
  return data as PortalOnboarding
}

export async function updateOnboarding(onboardingId: string, updates: Partial<PortalOnboarding>) {
  const { data, error } = await supabase
    .from('portal_onboardings')
    .update(updates)
    .eq('id', onboardingId)
    .select()
    .single()
  if (error) throw error
  return data as PortalOnboarding
}

export async function completeOnboarding(onboardingId: string) {
  return updateOnboarding(onboardingId, {
    status: 'pending_validation',
    completed_at: new Date().toISOString(),
  } as Partial<PortalOnboarding>)
}

export async function uploadPortalDocument(
  clientId: string,
  file: File,
  folder: string,
): Promise<string> {
  const path = `${clientId}/${folder}/${Date.now()}_${file.name}`
  const { error } = await supabase.storage
    .from('portal-documents')
    .upload(path, file, { upsert: true })
  if (error) throw error
  return path
}
