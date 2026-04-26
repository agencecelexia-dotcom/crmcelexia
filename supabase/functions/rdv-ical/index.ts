// Edge function : génère un fichier .ics (iCalendar) téléchargeable pour le RDV.
// Appelée via GET /functions/v1/rdv-ical?token=xxx
// Le token est celui de rdv_confirmations (réutilisé pour valider l'identité).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Format date pour iCal : YYYYMMDDTHHMMSSZ (UTC) */
function toICalDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

/** Échappe les caractères spéciaux iCal */
function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token) {
    return new Response('Missing token', { status: 400, headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Lookup token → rdv
  const { data: confirmRow } = await supabase
    .from('rdv_confirmations')
    .select('rdv_id')
    .eq('token', token)
    .maybeSingle()

  if (!confirmRow) {
    return new Response('Invalid token', { status: 404, headers: corsHeaders })
  }

  // Get RDV details
  const { data: rdv } = await supabase
    .from('rendez_vous')
    .select('id, scheduled_at, duration_minutes, meeting_url, prospect_id')
    .eq('id', confirmRow.rdv_id)
    .single()

  if (!rdv) {
    return new Response('RDV not found', { status: 404, headers: corsHeaders })
  }

  // Get prospect name
  const { data: prospect } = await supabase
    .from('prospects')
    .select('contact_firstname, contact_name, company_name')
    .eq('id', rdv.prospect_id)
    .single()

  const prospectDisplayName = [prospect?.contact_firstname, prospect?.contact_name].filter(Boolean).join(' ') || prospect?.company_name || 'RDV'

  const startISO = rdv.scheduled_at
  const endISO = new Date(new Date(rdv.scheduled_at).getTime() + (rdv.duration_minutes ?? 30) * 60_000).toISOString()

  const summary = `RDV Celexia · ${prospectDisplayName}`
  const description =
    `Rendez-vous visio avec Antoine Aubigeon (Celexia).\\n\\n` +
    `Lien Google Meet : ${rdv.meeting_url ?? 'à venir'}\\n\\n` +
    `Pour toute question : antoine@celexia-pro.fr · 07 69 13 61 82`
  const location = rdv.meeting_url ?? 'Visio Google Meet'

  // Build iCal
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Celexia//RDV//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${rdv.id}@celexia.fr`,
    `DTSTAMP:${toICalDate(new Date().toISOString())}`,
    `DTSTART:${toICalDate(startISO)}`,
    `DTEND:${toICalDate(endISO)}`,
    `SUMMARY:${escapeICS(summary)}`,
    `DESCRIPTION:${escapeICS(description)}`,
    `LOCATION:${escapeICS(location)}`,
    `URL:${rdv.meeting_url ?? ''}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:RDV Celexia dans 15 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="rdv-celexia.ics"`,
      ...corsHeaders,
    },
  })
})
