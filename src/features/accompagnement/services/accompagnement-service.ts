import { supabase } from '@/lib/supabase/client'
import type { Client, ClientAccompagnementStep } from '@/types'
import {
  ACCOMPAGNEMENT_STEPS_ORDER,
  ACCOMPAGNEMENT_STEP_LABELS,
  type AccompagnementStatus,
  type AccompagnementStep,
} from '@/types/enums'

const BLOCKED_DAYS_THRESHOLD = 7
const MS_PER_DAY = 86_400_000

// ─── Steps ─────────────────────────────────────────────────────────────

export async function getStepsForClient(clientId: string): Promise<ClientAccompagnementStep[]> {
  const { data, error } = await supabase
    .from('client_accompagnement_steps')
    .select('*, validator:profiles!client_accompagnement_steps_validated_by_fkey(id, full_name)')
    .eq('client_id', clientId)

  if (error) throw error

  // Sort by enum order (DB order is insertion order, may not match the canonical order)
  const order = new Map(ACCOMPAGNEMENT_STEPS_ORDER.map((s, i) => [s, i]))
  return ((data ?? []) as unknown as ClientAccompagnementStep[]).slice().sort((a, b) => {
    return (order.get(a.step) ?? 999) - (order.get(b.step) ?? 999)
  })
}

export async function markStepDone(stepId: string, validatedBy: string): Promise<void> {
  const { error } = await supabase
    .from('client_accompagnement_steps')
    .update({
      completed_at: new Date().toISOString(),
      validated_by: validatedBy,
    })
    .eq('id', stepId)

  if (error) throw error
}

export async function markStepUndone(stepId: string): Promise<void> {
  const { error } = await supabase
    .from('client_accompagnement_steps')
    .update({
      completed_at: null,
      validated_by: null,
    })
    .eq('id', stepId)

  if (error) throw error
}

export async function updateStepNotes(
  stepId: string,
  notes: string | null,
  resourceUrl?: string | null,
): Promise<void> {
  const updates: { notes: string | null; resource_url?: string | null } = { notes }
  if (resourceUrl !== undefined) {
    updates.resource_url = resourceUrl
  }
  const { error } = await supabase
    .from('client_accompagnement_steps')
    .update(updates)
    .eq('id', stepId)

  if (error) throw error
}

// ─── Aggregated list ───────────────────────────────────────────────────

export interface ClientAccompagnementSummary {
  client: Client
  steps: ClientAccompagnementStep[]
  status: AccompagnementStatus
  currentStep: AccompagnementStep | null
  currentStepLabel: string
  daysSinceSignature: number
  lastActivityAt: string
  completedCount: number
}

export async function getAllClientsAccompagnement(): Promise<ClientAccompagnementSummary[]> {
  // 1. Fetch all clients (founder-only — RLS will filter)
  const { data: clients, error: clientsErr } = await supabase
    .from('clients')
    .select('*, commercial:profiles!clients_commercial_id_fkey(id, full_name)')
    .is('deleted_at', null)

  if (clientsErr) throw clientsErr
  if (!clients || clients.length === 0) return []

  // 2. Fetch all accompagnement steps for those clients
  const clientIds = (clients as unknown as Client[]).map(c => c.id)
  const { data: stepsData, error: stepsErr } = await supabase
    .from('client_accompagnement_steps')
    .select('*, validator:profiles!client_accompagnement_steps_validated_by_fkey(id, full_name)')
    .in('client_id', clientIds)

  if (stepsErr) throw stepsErr

  // 3. Group steps by client_id
  const stepsByClient = new Map<string, ClientAccompagnementStep[]>()
  ;((stepsData ?? []) as unknown as ClientAccompagnementStep[]).forEach(s => {
    const arr = stepsByClient.get(s.client_id) ?? []
    arr.push(s)
    stepsByClient.set(s.client_id, arr)
  })

  // 4. Build summaries
  const order = new Map(ACCOMPAGNEMENT_STEPS_ORDER.map((s, i) => [s, i]))
  const now = Date.now()

  return (clients as unknown as Client[]).map((client): ClientAccompagnementSummary => {
    const steps = (stepsByClient.get(client.id) ?? []).slice().sort((a, b) => {
      return (order.get(a.step) ?? 999) - (order.get(b.step) ?? 999)
    })

    const completedCount = steps.filter(s => s.completed_at !== null).length
    const allDone = steps.length > 0 && completedCount === steps.length

    // Find first non-completed step (the "current" step)
    let currentStep: AccompagnementStep | null = null
    for (const stepKey of ACCOMPAGNEMENT_STEPS_ORDER) {
      const found = steps.find(s => s.step === stepKey)
      if (!found) continue
      if (!found.completed_at) {
        currentStep = stepKey
        break
      }
    }

    const currentStepLabel = allDone
      ? 'Lancé'
      : currentStep
      ? ACCOMPAGNEMENT_STEP_LABELS[currentStep]
      : '—'

    // Last activity = max(updated_at) across steps; fallback to client.converted_at
    const lastActivityAt = steps.reduce<string>((max, s) => {
      return s.updated_at > max ? s.updated_at : max
    }, client.converted_at ?? client.created_at)

    const daysSinceLastActivity = (now - new Date(lastActivityAt).getTime()) / MS_PER_DAY

    let status: AccompagnementStatus
    if (allDone) {
      status = 'launched'
    } else if (daysSinceLastActivity > BLOCKED_DAYS_THRESHOLD) {
      status = 'blocked'
    } else {
      status = 'on_track'
    }

    const daysSinceSignature = client.converted_at
      ? Math.floor((now - new Date(client.converted_at).getTime()) / MS_PER_DAY)
      : 0

    return {
      client,
      steps,
      status,
      currentStep,
      currentStepLabel,
      daysSinceSignature,
      lastActivityAt,
      completedCount,
    }
  })
}

// ─── KPIs per client (used in client detail page) ──────────────────────

export interface ClientKpis {
  leadsCount: number
  signedDealsCount: number
  /** Total commission générée par les leads signés (peu importe statut paiement). */
  totalCommissionGenerated: number
  /** Total commission déjà encaissée (commission_status='paid' uniquement). */
  totalCommissionPaid: number
}

export async function getClientKpis(clientId: string): Promise<ClientKpis> {
  // Single query : on lit tous les leads (leur agrégats sont calculés côté JS).
  // Source unique = portal_leads. La table "commissions" historique n'est plus
  // utilisée — elle restait à 0 lignes en prod et déconnectait l'admin du
  // vrai système (portal_leads.commission_status introduit en 00096).
  const { data, error } = await supabase
    .from('portal_leads')
    .select('status, commission_amount, commission_status')
    .eq('client_id', clientId)
    .is('deleted_at', null)
  if (error) throw error

  const leads = data ?? []
  let leadsCount = 0
  let signedDealsCount = 0
  let totalCommissionGenerated = 0
  let totalCommissionPaid = 0
  for (const l of leads) {
    leadsCount++
    if (l.status === 'signe') {
      signedDealsCount++
      const amount = Number(l.commission_amount ?? 0)
      totalCommissionGenerated += amount
      if (l.commission_status === 'paid') {
        totalCommissionPaid += amount
      }
    }
  }

  return {
    leadsCount,
    signedDealsCount,
    totalCommissionGenerated,
    totalCommissionPaid,
  }
}
