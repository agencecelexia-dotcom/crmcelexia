import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * Edge Function : pause un lead dans Smartlead quand le commercial a eu
 * un dialogue effectif au téléphone (status prospect change vers post-call).
 *
 * Input (POST JSON) : { prospect_id: string, reason?: string }
 *
 * Workflow :
 *   1. Récupère le prospect en DB (email + phone)
 *   2. Trouve le lead Smartlead par email puis phone
 *   3. Pause le lead via API Smartlead
 *   4. Marque dans custom_fields.smartlead_paused_at + raison
 */

function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const d = raw.replace(/[^\d]/g, '')
  if (d.startsWith('33') && d.length === 11) return '0' + d.slice(2)
  if (d.length === 10 && d.startsWith('0')) return d
  if (d.length === 9) return '0' + d
  return d
}

async function findSmartleadLead(email: string, phone: string, apiKey: string): Promise<{ lead_id: number; campaign_id: number } | null> {
  // 1. Cherche dans toutes les campagnes par email
  const campaignsRes = await fetch(`https://server.smartlead.ai/api/v1/campaigns?api_key=${apiKey}`)
  if (!campaignsRes.ok) return null
  const campaigns = await campaignsRes.json() as Array<{ id: number }>
  for (const c of campaigns) {
    // Smartlead a un endpoint /leads/?email=X mais on va paginer
    let offset = 0
    while (true) {
      const r = await fetch(`https://server.smartlead.ai/api/v1/campaigns/${c.id}/leads?api_key=${apiKey}&offset=${offset}&limit=100`)
      if (!r.ok) break
      const body = await r.json() as { data?: Array<{ lead: { id: number; email: string; phone_number?: string } }> }
      const batch = body.data ?? []
      for (const ld of batch) {
        const l = ld.lead
        if ((l.email ?? '').toLowerCase() === email.toLowerCase()) {
          return { lead_id: l.id, campaign_id: c.id }
        }
        if (phone && normalizePhone(l.phone_number) === phone) {
          return { lead_id: l.id, campaign_id: c.id }
        }
      }
      if (batch.length < 100) break
      offset += 100
    }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  let payload: { prospect_id?: string; reason?: string }
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const prospectId = payload.prospect_id
  if (!prospectId) {
    return new Response(JSON.stringify({ error: 'prospect_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const SMARTLEAD_API_KEY = Deno.env.get('SMARTLEAD_API_KEY')
  if (!SMARTLEAD_API_KEY) {
    return new Response(JSON.stringify({ error: 'SMARTLEAD_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 1. Récupère le prospect
  const { data: prospect, error } = await supabase
    .from('prospects')
    .select('id, contact_email, phone, status, custom_fields')
    .eq('id', prospectId)
    .single()

  if (error || !prospect) {
    return new Response(JSON.stringify({ error: 'prospect not found', details: error?.message }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const email = (prospect.contact_email ?? '').toLowerCase().trim()
  const phone = normalizePhone(prospect.phone)
  if (!email && !phone) {
    return new Response(JSON.stringify({ skipped: true, reason: 'no email or phone' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // 2. Trouve le lead Smartlead
  const sl = await findSmartleadLead(email, phone, SMARTLEAD_API_KEY)
  if (!sl) {
    // Pas dans Smartlead, rien à pauser
    await supabase.from('prospects').update({
      custom_fields: { ...(prospect.custom_fields ?? {}), smartlead_paused_at: new Date().toISOString(), smartlead_pause_reason: 'not_in_smartlead' },
    }).eq('id', prospectId)
    return new Response(JSON.stringify({ ok: true, paused: false, reason: 'lead not found in any Smartlead campaign' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // 3. Pause le lead dans Smartlead
  const pauseRes = await fetch(`https://server.smartlead.ai/api/v1/leads/${sl.lead_id}/pause-lead?api_key=${SMARTLEAD_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const pauseBody = await pauseRes.text()

  // 4. Marque en DB
  await supabase.from('prospects').update({
    custom_fields: {
      ...(prospect.custom_fields ?? {}),
      smartlead_paused_at: new Date().toISOString(),
      smartlead_pause_reason: payload.reason || `status_changed_to_${prospect.status}`,
      smartlead_paused_lead_id: sl.lead_id,
      smartlead_paused_campaign_id: sl.campaign_id,
    },
  }).eq('id', prospectId)

  console.log(`Paused lead ${sl.lead_id} in campaign ${sl.campaign_id} for prospect ${prospectId} (reason: ${payload.reason})`)

  return new Response(JSON.stringify({
    ok: pauseRes.ok,
    paused: pauseRes.ok,
    lead_id: sl.lead_id,
    campaign_id: sl.campaign_id,
    smartlead_response: pauseBody,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
