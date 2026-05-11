import { supabase } from '@/lib/supabase/client'
import type { PortalOnboarding } from '../hooks/use-portal-auth'

const UPLOAD_TIMEOUT_MS = 60_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout après ${ms / 1000}s`)), ms),
    ),
  ])
}

/** Nettoie un nom de fichier pour usage dans un path Supabase Storage :
 *  enlève /, \, ?, *, accents, espaces, et limite la longueur. */
function sanitizeFileName(name: string): string {
  // Extrait l'extension proprement
  const lastDot = name.lastIndexOf('.')
  const base = lastDot > 0 ? name.slice(0, lastDot) : name
  const ext = lastDot > 0 ? name.slice(lastDot) : ''
  // Normalize : enlève accents, garde alphanumériques + - _
  const safeBase = base
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120)
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10)
  return safeBase + safeExt
}

export async function getOnboarding(clientId: string): Promise<PortalOnboarding | null> {
  const { data, error } = await supabase
    .from('portal_onboardings')
    .select('*')
    .eq('client_id', clientId)
    .single()
  if (error) return null
  return data as PortalOnboarding
}

/** Fetch fresh par ID. Utile pour vérifier la complétude juste avant
 *  une action sensible (anti race-condition). */
export async function getOnboardingById(onboardingId: string): Promise<PortalOnboarding | null> {
  const { data, error } = await supabase
    .from('portal_onboardings')
    .select('*')
    .eq('id', onboardingId)
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
    rejection_reason: null,
  })
}

/** Soumet l'onboarding à l'agence pour validation. Le trigger DB
 *  `enforce_portal_onboarding_invariants` vérifie que les 4 étapes sont
 *  complétées avant d'autoriser la bascule en 'pending_validation'. */
export async function submitOnboardingForValidation(onboardingId: string) {
  return updateOnboarding(onboardingId, {
    status: 'pending_validation',
    completed_at: new Date().toISOString(),
    rejection_reason: null,
  })
}

export async function uploadPortalDocument(
  clientId: string,
  file: File,
  folder: string,
): Promise<string> {
  const safeName = sanitizeFileName(file.name)
  const path = `${clientId}/${folder}/${Date.now()}_${safeName}`
  const { error } = await withTimeout(
    supabase.storage.from('portal-documents').upload(path, file, { upsert: true }),
    UPLOAD_TIMEOUT_MS,
    'Upload',
  )
  if (error) throw error
  return path
}
