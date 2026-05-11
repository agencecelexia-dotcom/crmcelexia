// Edge function : annule un RDV via le token de confirmation
// Appelée par POST /functions/v1/cancel-rdv-presence body { token, reason? }
// Retourne JSON consommé par la page React /rdv/annuler.
// Le trigger DB on_rdv_status_email se charge d'envoyer rdv_cancelled au prospect.
// Le trigger DB on_rdv_status_internal_alert se charge d'envoyer internal_rdv_cancelled à l'agence.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function formatRdv(scheduledAt: string | null) {
  if (!scheduledAt) return { rdv_date: '', rdv_time: '' }
  const d = new Date(scheduledAt)
  const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
  const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  // Edge Functions en UTC → force le formatage en heure Paris (DST safe)
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris',
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short',
      hourCycle: 'h23',
    }).formatToParts(d).map(part => [part.type, part.value]),
  ) as Record<string, string>
  return {
    rdv_date: `${dayNames[weekdayMap[p.weekday] ?? 0]} ${parseInt(p.day)} ${monthNames[parseInt(p.month) - 1]}`,
    rdv_time: `${p.hour}h${p.minute}`,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // GET = info-only (pour afficher le RDV avant confirmation d'annulation)
  // POST = action d'annulation effective
  let token: string | null = null
  let reason: string | null = null
  let action: 'info' | 'cancel' = 'info'

  if (req.method === 'GET') {
    const url = new URL(req.url)
    token = url.searchParams.get('token')
    action = 'info'
  } else if (req.method === 'POST') {
    try {
      const body = await req.json()
      token = body?.token ?? null
      reason = body?.reason ?? null
      action = 'cancel'
    } catch (_) {
      return jsonResponse({ status: 'invalid' }, 400)
    }
  } else {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  if (!token || token.length < 16) {
    return jsonResponse({ status: 'invalid' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: row, error } = await supabase
    .from('rdv_confirmations')
    .select('id, rdv_id, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (error || !row) {
    return jsonResponse({ status: 'invalid' }, 404)
  }

  if (new Date(row.expires_at) < new Date()) {
    return jsonResponse({ status: 'expired' }, 410)
  }

  // Récupère le RDV
  const { data: rdv } = await supabase
    .from('rendez_vous')
    .select('id, status, scheduled_at')
    .eq('id', row.rdv_id)
    .single()

  if (!rdv) {
    return jsonResponse({ status: 'invalid' }, 404)
  }

  const { rdv_date, rdv_time } = formatRdv(rdv.scheduled_at)

  // Already cancelled
  if (rdv.status === 'annule') {
    return jsonResponse({ status: 'already_cancelled', rdv_date, rdv_time }, 200)
  }

  // GET → info-only response (la page React l'utilise pour afficher les détails avant action)
  if (action === 'info') {
    return jsonResponse({ status: 'ready_to_cancel', rdv_date, rdv_time }, 200)
  }

  // POST → action effective
  const reasonClean = reason && reason.trim().length > 0
    ? `Annulé par le client : ${reason.trim().slice(0, 500)}`
    : 'Annulé par le client via lien email'

  const { error: updateErr } = await supabase
    .from('rendez_vous')
    .update({
      status: 'annule',
      no_show_reason: reasonClean,
    })
    .eq('id', rdv.id)

  if (updateErr) {
    console.error('cancel-rdv-presence update error:', updateErr)
    return jsonResponse({ status: 'invalid' }, 500)
  }

  return jsonResponse({ status: 'cancelled', rdv_date, rdv_time }, 200)
})
