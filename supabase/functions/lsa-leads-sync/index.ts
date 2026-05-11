// LSA Leads Sync — polling Google Local Services API
//
// Modèle Celexia : 1 compte Google (manager) gère N businesses LSA (1 par
// artisan). Cette fonction :
//   1. Échange un refresh token contre un access token Google
//   2. Récupère les leads des dernières heures
//   3. Pour chaque lead, identifie l'artisan via clients.lsa_business_id
//   4. Insère/upsert dans portal_leads via la fonction SQL upsert_portal_lead_from_lsa
//
// Idempotent grâce à lsa_lead_id unique.
//
// Secrets requis (à setter via dashboard Supabase ou supabase secrets set) :
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REFRESH_TOKEN
//   GOOGLE_LSA_MANAGER_ID  (format : 123-456-7890 ou 1234567890)
//
// Déclenché par cron Supabase ou pg_cron. Idempotent : tu peux l'appeler
// autant que tu veux, les doublons sont écartés.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

interface LSALead {
  leadId: string
  businessId?: string
  business?: { businessId?: string }
  leadType?: 'MESSAGE' | 'PHONE_CALL' | 'BOOKING' | string
  leadCreationTimestamp?: string
  phoneLead?: {
    chargedConnectedCallDurationSeconds?: string | number
    consumerPhoneNumber?: string
  }
  messageLead?: {
    consumerPhoneNumber?: string
    customerName?: string
    jobType?: string
    postalCode?: string
  }
  geo?: string
  // Champs courants utilisés selon la réponse
  [k: string]: unknown
}

interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

interface DetailedLeadReportsResponse {
  detailedLeadReports?: LSALead[]
  nextPageToken?: string
}

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  const refreshToken = Deno.env.get('GOOGLE_OAUTH_REFRESH_TOKEN')
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing GOOGLE_OAUTH_* secrets. Set them in Supabase Edge Function secrets.')
  }
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`Google token exchange failed (${resp.status}): ${txt}`)
  }
  const json = await resp.json() as GoogleTokenResponse
  return json.access_token
}

/** Normalise un ID Google "123-456-7890" → "1234567890" */
function normalizeManagerId(raw: string): string {
  return raw.replace(/-/g, '').trim()
}

async function fetchLeads(accessToken: string, managerId: string, sinceDate: Date): Promise<LSALead[]> {
  // Format date YYYY-MM-DD (Google Local Services API attend des dates sans heure)
  const startDate = sinceDate.toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const query = encodeURIComponent(`manager_customer_id:${managerId};start_date:${startDate};end_date:${today}`)
  const url = `https://localservices.googleapis.com/v1/detailedLeadReports:search?query=${query}&pageSize=200`

  const all: LSALead[] = []
  let pageToken: string | undefined = undefined
  do {
    const u = pageToken ? `${url}&pageToken=${pageToken}` : url
    const resp = await fetch(u, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    })
    if (!resp.ok) {
      const txt = await resp.text()
      throw new Error(`LSA API error (${resp.status}): ${txt}`)
    }
    const json = await resp.json() as DetailedLeadReportsResponse
    if (json.detailedLeadReports) all.push(...json.detailedLeadReports)
    pageToken = json.nextPageToken
  } while (pageToken)

  return all
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Période de scan : par défaut 2 derniers jours (couvre les retards Google
  // + permet de rattraper si la fonction n'a pas tourné quelques heures)
  let lookbackDays = 2
  try {
    const body = await req.clone().json()
    if (body?.lookback_days && Number(body.lookback_days) > 0) {
      lookbackDays = Math.min(30, Number(body.lookback_days))
    }
  } catch (_) { /* GET ou body vide */ }

  const sinceDate = new Date(Date.now() - lookbackDays * 86_400_000)

  try {
    const managerIdRaw = Deno.env.get('GOOGLE_LSA_MANAGER_ID')
    if (!managerIdRaw) throw new Error('Missing GOOGLE_LSA_MANAGER_ID secret')
    const managerId = normalizeManagerId(managerIdRaw)

    const accessToken = await getAccessToken()
    const leads = await fetchLeads(accessToken, managerId, sinceDate)

    let inserted = 0
    let updated = 0
    let skipped_no_mapping = 0
    let errors = 0

    for (const lead of leads) {
      const leadId = lead.leadId
      if (!leadId) { errors++; continue }
      const businessId = lead.businessId ?? lead.business?.businessId ?? null
      if (!businessId) { errors++; continue }

      // Extraire les infos selon le type
      const leadType = lead.leadType === 'PHONE_CALL' ? 'phone_call'
        : lead.leadType === 'MESSAGE' ? 'message'
        : lead.leadType === 'BOOKING' ? 'booking'
        : 'message'

      const phone = lead.phoneLead?.consumerPhoneNumber
        ?? lead.messageLead?.consumerPhoneNumber
        ?? ''
      const name = lead.messageLead?.customerName ?? ''
      const workType = lead.messageLead?.jobType ?? ''
      const city = lead.messageLead?.postalCode ?? lead.geo ?? null
      const callDuration = lead.phoneLead?.chargedConnectedCallDurationSeconds
        ? Number(lead.phoneLead.chargedConnectedCallDurationSeconds)
        : null
      const receivedAt = lead.leadCreationTimestamp ?? null

      const { data, error } = await supabase.rpc('upsert_portal_lead_from_lsa', {
        p_lsa_lead_id: leadId,
        p_business_id: businessId,
        p_name: name,
        p_phone: phone,
        p_city: city,
        p_work_type: workType,
        p_lead_type: leadType,
        p_call_duration_seconds: callDuration,
        p_received_at: receivedAt,
      })

      if (error) {
        console.error(`[lsa-sync] upsert failed for leadId=${leadId}`, error)
        errors++
        continue
      }

      const row = Array.isArray(data) ? data[0] : data
      if (!row?.lead_id) {
        skipped_no_mapping++
        console.warn(`[lsa-sync] no client mapping for businessId=${businessId}, leadId=${leadId}`)
        continue
      }
      if (row.was_new) inserted++; else updated++
    }

    return new Response(JSON.stringify({
      ok: true,
      scanned: leads.length,
      inserted,
      updated,
      skipped_no_mapping,
      errors,
      since: sinceDate.toISOString(),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[lsa-sync] failed:', err)
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
