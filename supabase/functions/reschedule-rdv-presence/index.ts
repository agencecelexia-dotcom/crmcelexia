// Edge function : retourne l'URL Cal.com de reschedule pour un RDV (basée sur le token)
// Appelée par GET /functions/v1/reschedule-rdv-presence?token=xxx
// La page React /rdv/replanifier fait un window.location.href = reschedule_url.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FALLBACK_URL = 'https://cal.com/celexia/30min'

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token || token.length < 16) {
    return jsonResponse({ status: 'invalid', reschedule_url: FALLBACK_URL }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: row, error } = await supabase
    .from('rdv_confirmations')
    .select('rdv_id, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (error || !row) {
    return jsonResponse({ status: 'invalid', reschedule_url: FALLBACK_URL }, 404)
  }

  if (new Date(row.expires_at) < new Date()) {
    return jsonResponse({ status: 'expired', reschedule_url: FALLBACK_URL }, 410)
  }

  const { data: rdv } = await supabase
    .from('rendez_vous')
    .select('external_booking_id, status')
    .eq('id', row.rdv_id)
    .single()

  if (!rdv) {
    return jsonResponse({ status: 'invalid', reschedule_url: FALLBACK_URL }, 404)
  }

  if (rdv.status === 'annule') {
    return jsonResponse({ status: 'cancelled', reschedule_url: FALLBACK_URL }, 200)
  }

  const reschedule_url = rdv.external_booking_id
    ? `https://cal.com/reschedule/${rdv.external_booking_id}`
    : FALLBACK_URL

  return jsonResponse({ status: 'ok', reschedule_url }, 200)
})
