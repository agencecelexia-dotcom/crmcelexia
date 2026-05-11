// Edge function : valide le token de confirmation RDV et marque rdv_confirmations.confirmed_at
// Appelée par GET /functions/v1/confirm-rdv-presence?token=xxx
// Retourne JSON pour consommation par la page React (crmcelexia.vercel.app/rdv/confirmer).

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

  const url = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token || token.length < 16) {
    return jsonResponse({ status: 'invalid' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: row, error } = await supabase
    .from('rdv_confirmations')
    .select('id, rdv_id, confirmed_at, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (error || !row) {
    return jsonResponse({ status: 'invalid' }, 404)
  }

  // Récupère les infos du RDV pour affichage
  const { data: rdv } = await supabase
    .from('rendez_vous')
    .select('scheduled_at')
    .eq('id', row.rdv_id)
    .single()

  const { rdv_date, rdv_time } = formatRdv(rdv?.scheduled_at ?? null)

  // Already confirmed
  if (row.confirmed_at) {
    return jsonResponse({ status: 'already', rdv_date, rdv_time }, 200)
  }

  // Check expiration
  if (new Date(row.expires_at) < new Date()) {
    return jsonResponse({ status: 'expired' }, 410)
  }

  // Mark as confirmed
  const userAgent = req.headers.get('user-agent') ?? null
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  const { error: updateErr } = await supabase
    .from('rdv_confirmations')
    .update({
      confirmed_at: new Date().toISOString(),
      confirmed_user_agent: userAgent,
      confirmed_ip: ip,
    })
    .eq('id', row.id)

  if (updateErr) {
    console.error('confirm-rdv-presence update error:', updateErr)
    return jsonResponse({ status: 'invalid' }, 500)
  }

  return jsonResponse({ status: 'success', rdv_date, rdv_time }, 200)
})
