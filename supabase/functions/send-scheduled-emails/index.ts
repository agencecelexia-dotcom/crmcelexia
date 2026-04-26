// Edge function : appelée par cron N8N toutes les 5 min.
// Traite les emails programmés (email_schedule) dont scheduled_at <= NOW().
// Construit confirm_url + cal_links + variables prospect/rdv/case_study + envoie via Resend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const RESEND_URL = 'https://api.resend.com/emails'
const SUPABASE_FN_BASE = 'https://zsbrhftzjqqqbwbboyqe.supabase.co/functions/v1'
const FROM_FALLBACK = 'onboarding@resend.dev'

interface EmailScheduleRow {
  id: string
  rdv_id: string | null
  prospect_id: string | null
  recipient_email: string
  recipient_name: string | null
  email_type: string
  scheduled_at: string
  payload: Record<string, unknown>
  attachments: Array<{ filename: string; storage_bucket: string; storage_path: string; content_type: string }>
  attempt_count: number
}

interface EmailTemplate {
  slug: string
  subject_template: string
  html_template: string
  from_name: string
  from_email: string
  reply_to: string
}

function fillTemplate(tpl: string, vars: Record<string, string | number | null | undefined>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_m, key) => {
    const v = vars[key]
    return v === null || v === undefined ? '' : String(v)
  })
}

function professionToSector(profession: string | null | undefined): string {
  if (!profession) return 'autre'
  const p = profession.toLowerCase()
  if (p.includes('paysag') || p.includes('jardin')) return 'paysagiste'
  if (p.includes('piscin')) return 'pisciniste'
  if (p.includes('plomb') || p.includes('chauffag')) return 'plombier'
  if (p.includes('couvr') || p.includes('toitur') || p.includes('zingu')) return 'couvreur'
  if (p.includes('électric') || p.includes('electric')) return 'electricien'
  if (p.includes('maçon') || p.includes('macon')) return 'macon'
  if (p.includes('menuis') || p.includes('charpent')) return 'menuisier'
  if (p.includes('démén') || p.includes('demen')) return 'demenageur'
  return 'autre'
}

function sectorLabel(sector: string): string {
  const map: Record<string, string> = {
    paysagiste: 'paysagiste',
    pisciniste: 'pisciniste',
    plombier: 'plombier',
    couvreur: 'couvreur',
    electricien: 'électricien',
    macon: 'maçon',
    menuisier: 'menuisier',
    demenageur: 'déménageur',
    autre: 'artisan',
  }
  return map[sector] ?? sector
}

function formatDateFR(iso: string): { day: string; full: string; time: string; relative: string; durationLabel: string } {
  const d = new Date(iso)
  const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
  const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  const dayName = dayNames[d.getDay()]
  const dayNum = d.getDate()
  const monthName = monthNames[d.getMonth()]
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')

  const full = `${dayName} ${dayNum} ${monthName} ${year}`
  const day = `${dayName} ${dayNum} ${monthName}`
  const time = `${hours}h${mins}`

  const now = new Date()
  const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  let relative = 'bientôt'
  if (diffDays === 0) relative = "aujourd'hui"
  else if (diffDays === 1) relative = 'demain'
  else if (diffDays === -1) relative = 'hier'
  else if (diffDays > 1 && diffDays <= 7) relative = `dans ${diffDays} jours`
  else if (diffDays > 7) relative = `dans ${Math.ceil(diffDays / 7)} semaines`

  return { day, full, time, relative, durationLabel: '30 min' }
}

function formatMoneyShort(n: number | null | undefined): string {
  if (!n) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`
  if (n >= 1000) return `${Math.round(n / 1000)}k€`
  return `${n}€`
}

/** Format date pour Google Calendar URL : YYYYMMDDTHHMMSSZ (UTC) */
function toGoogleCalDate(iso: string): string {
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

/** Build calendar URLs (Google + Outlook) + iCal endpoint */
function buildCalendarUrls(opts: {
  rdv_start_iso: string
  rdv_duration_min: number
  meeting_url: string | null
  prospect_name: string
  token: string
}): { google: string; outlook: string; ical: string } {
  const start = new Date(opts.rdv_start_iso)
  const end = new Date(start.getTime() + opts.rdv_duration_min * 60_000)

  const title = `RDV Celexia · ${opts.prospect_name}`
  const description = `Rendez-vous visio avec Antoine Aubigeon (Celexia).${opts.meeting_url ? `\n\nLien Google Meet : ${opts.meeting_url}` : ''}\n\nContact : antoine@celexia-pro.fr · 07 69 13 61 82`
  const location = opts.meeting_url ?? 'Visio Google Meet'

  // Google
  const googleParams = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${toGoogleCalDate(opts.rdv_start_iso)}/${toGoogleCalDate(end.toISOString())}`,
    details: description,
    location,
  })
  const google = `https://calendar.google.com/calendar/render?${googleParams.toString()}`

  // Outlook (Live)
  const outlookParams = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: title,
    startdt: opts.rdv_start_iso,
    enddt: end.toISOString(),
    body: description,
    location,
  })
  const outlook = `https://outlook.live.com/calendar/0/deeplink/compose?${outlookParams.toString()}`

  // iCal endpoint
  const ical = `${SUPABASE_FN_BASE}/rdv-ical?token=${encodeURIComponent(opts.token)}`

  return { google, outlook, ical }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 1. Récupérer les emails dus
  const { data: due, error: dueErr } = await supabase
    .from('email_schedule')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(50)

  if (dueErr) {
    return new Response(JSON.stringify({ error: 'Failed to query', details: dueErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!due || due.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 2. Cache templates
  const { data: tpls } = await supabase
    .from('email_templates')
    .select('slug, subject_template, html_template, from_name, from_email, reply_to')
    .eq('is_active', true)

  const tplBySlug = new Map<string, EmailTemplate>()
  for (const t of tpls ?? []) tplBySlug.set(t.slug, t as EmailTemplate)

  const results: Array<{ id: string; status: string; error?: string; resend_id?: string }> = []

  for (const row of due as EmailScheduleRow[]) {
    try {
      // Increment attempt
      await supabase.from('email_schedule').update({ attempt_count: row.attempt_count + 1 }).eq('id', row.id)

      const tpl = tplBySlug.get(row.email_type)
      if (!tpl) {
        await supabase.from('email_schedule').update({
          status: 'failed', error_message: `No template for slug: ${row.email_type}`,
        }).eq('id', row.id)
        results.push({ id: row.id, status: 'failed', error: 'no_template' })
        continue
      }

      // Skip if rdv_confirmation_reminder already confirmed
      if (row.email_type === 'rdv_confirmation_reminder' && row.rdv_id) {
        const { data: confirmRow } = await supabase
          .from('rdv_confirmations')
          .select('confirmed_at')
          .eq('rdv_id', row.rdv_id)
          .maybeSingle()
        if (confirmRow?.confirmed_at) {
          await supabase.from('email_schedule').update({
            status: 'cancelled', error_message: 'Already confirmed',
          }).eq('id', row.id)
          results.push({ id: row.id, status: 'cancelled', error: 'already_confirmed' })
          continue
        }
      }

      const vars: Record<string, string | number | null | undefined> = {}

      // Token (du payload, set par le trigger DB)
      const token = (row.payload?.token as string) ?? ''

      // Prospect
      let sector = 'autre'
      if (row.prospect_id) {
        const { data: p } = await supabase
          .from('prospects')
          .select('contact_firstname, contact_name, company_name, profession, city, contact_email')
          .eq('id', row.prospect_id)
          .single()
        if (p) {
          vars.prospect_firstname = p.contact_firstname || p.company_name || 'cher artisan'
          vars.prospect_lastname = p.contact_name || ''
          vars.prospect_company = p.company_name || ''
          vars.prospect_city = p.city || ''
          vars.prospect_profession = p.profession || ''
          sector = professionToSector(p.profession)
          vars.prospect_sector_label = sectorLabel(sector)
          vars.prospect_sector_singular = sectorLabel(sector)
        }
      }

      // Case study (only for rdv_trust_builder)
      if (row.email_type === 'rdv_trust_builder') {
        let { data: cs } = await supabase
          .from('case_studies')
          .select('*')
          .eq('sector', sector)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()
        if (!cs) {
          const { data: csFb } = await supabase
            .from('case_studies').select('*').eq('sector', 'autre').eq('is_active', true).limit(1).maybeSingle()
          cs = csFb
        }
        if (cs) {
          vars.case_artisan_firstname = cs.artisan_name?.split(' ')[0] ?? ''
          vars.case_artisan_company = cs.artisan_company ?? ''
          vars.case_artisan_city = cs.artisan_city ?? ''
          vars.case_devis_count = cs.metric_devis_count
          vars.case_period_months = cs.metric_period_months
          vars.case_revenue_short = formatMoneyShort(cs.metric_revenue_eur)
          vars.case_story_short = cs.story_short
          vars.case_quote = cs.testimonial_quote ?? ''
          vars.case_sector_label = sectorLabel(cs.sector).toUpperCase()
        }
      }

      // RDV details
      let rdvDuration = 30
      let rdvStartIso = new Date().toISOString()
      let meetingUrl: string | null = null
      if (row.rdv_id) {
        const { data: rdv } = await supabase
          .from('rendez_vous')
          .select('scheduled_at, meeting_url, duration_minutes')
          .eq('id', row.rdv_id)
          .single()
        if (rdv) {
          rdvStartIso = rdv.scheduled_at
          rdvDuration = rdv.duration_minutes ?? 30
          meetingUrl = rdv.meeting_url
          const fmt = formatDateFR(rdv.scheduled_at)
          vars.rdv_date_human = fmt.full
          vars.rdv_day_human = fmt.day
          vars.rdv_time_human = fmt.time
          vars.rdv_when_relative = fmt.relative
          vars.rdv_duration = `${rdvDuration} min`
          vars.meeting_url = rdv.meeting_url ?? 'https://cal.com/celexia/30min'
        }
      }

      // Confirm URL + Calendar URLs
      if (token) {
        vars.confirm_url = `${SUPABASE_FN_BASE}/confirm-rdv-presence?token=${encodeURIComponent(token)}`
        const cal = buildCalendarUrls({
          rdv_start_iso: rdvStartIso,
          rdv_duration_min: rdvDuration,
          meeting_url: meetingUrl,
          prospect_name: String(vars.prospect_firstname ?? 'Prospect'),
          token,
        })
        vars.google_cal_url = cal.google
        vars.outlook_cal_url = cal.outlook
        vars.ical_url = cal.ical
      }

      // Defaults Antoine
      vars.antoine_phone = '+33769136182'
      vars.antoine_phone_display = '07 69 13 61 82'
      // Defaults Thomas
      vars.thomas_phone = '+33651725756'
      vars.thomas_phone_display = '06 51 72 57 56'
      vars.reschedule_url = 'https://cal.com/celexia/30min'
      vars.reminder_number = (row.payload?.reminder_number as number) ?? 1
      vars.portal_url = 'https://crmcelexia.vercel.app/portal/auth'

      // Alias client_* depuis prospect (pour template client_welcome)
      if (row.email_type === 'client_welcome' || row.email_type.startsWith('portal_')) {
        vars.client_firstname = vars.prospect_firstname
        vars.client_lastname = vars.prospect_lastname
        vars.client_company = vars.prospect_company
        vars.client_sector_label = vars.prospect_sector_label
        // quote_url placeholder (pas encore implémenté côté client)
        vars.quote_url = 'https://crmcelexia.vercel.app/portal/auth'
      }

      // Override avec payload custom si présent
      if (row.payload) {
        for (const [k, v] of Object.entries(row.payload)) {
          if (v !== null && v !== undefined && k !== 'token' && k !== 'reminder_number') {
            vars[k] = v as string | number
          }
        }
      }

      // Internal email types : enrichir vars avec payload data
      if (row.email_type.startsWith('internal_')) {
        for (const [k, v] of Object.entries(row.payload ?? {})) {
          if (v !== null && v !== undefined) vars[k] = v as string | number
        }
        // Helpers de format
        const price = Number(row.payload?.project_price ?? 0)
        const budget = Number(row.payload?.budget_pub ?? 0)
        vars.project_price_human = price > 0 ? `${price.toLocaleString('fr-FR')} €` : '—'
        vars.budget_pub_human = budget > 0 ? `${budget.toLocaleString('fr-FR')} €/mois` : '—'
        if (!vars.contact_name) vars.contact_name = '—'
        if (!vars.profession) vars.profession = '—'
        if (!vars.city) vars.city = '—'
      }

      const subject = fillTemplate(tpl.subject_template, vars)
      const html = fillTemplate(tpl.html_template, vars)

      // Récupère les attachments depuis Storage (si présents)
      const resendAttachments: Array<{ filename: string; content: string }> = []
      if (Array.isArray(row.attachments) && row.attachments.length > 0) {
        for (const att of row.attachments) {
          try {
            const { data: blob } = await supabase.storage
              .from(att.storage_bucket)
              .download(att.storage_path)
            if (blob) {
              const buf = new Uint8Array(await blob.arrayBuffer())
              // base64 encode (Deno standard)
              let binary = ''
              for (let i = 0; i < buf.byteLength; i++) binary += String.fromCharCode(buf[i])
              const b64 = btoa(binary)
              resendAttachments.push({ filename: att.filename, content: b64 })
            }
          } catch (attErr) {
            console.error(`Failed to load attachment ${att.storage_path}:`, attErr)
          }
        }
      }

      // Send via Resend (avec fallback si domain pas vérifié)
      const fromPrimary = `${tpl.from_name} <${tpl.from_email}>`
      const resendBody: Record<string, unknown> = {
        from: fromPrimary, to: [row.recipient_email], subject, html, reply_to: tpl.reply_to,
      }
      if (resendAttachments.length > 0) resendBody.attachments = resendAttachments

      let resp = await fetch(RESEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(resendBody),
      })

      if (resp.status === 403) {
        const fallbackBody = {
          ...resendBody,
          from: `${tpl.from_name} <${FROM_FALLBACK}>`,
        }
        resp = await fetch(RESEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(fallbackBody),
        })
      }

      const respBody = await resp.json() as { id?: string; message?: string }

      if (resp.status >= 400) {
        await supabase.from('email_schedule').update({
          status: 'failed', error_message: respBody.message || `HTTP ${resp.status}`,
        }).eq('id', row.id)
        results.push({ id: row.id, status: 'failed', error: respBody.message })
      } else {
        await supabase.from('email_schedule').update({
          status: 'sent', sent_at: new Date().toISOString(), resend_id: respBody.id ?? null,
        }).eq('id', row.id)
        results.push({ id: row.id, status: 'sent', resend_id: respBody.id })
      }
    } catch (err) {
      await supabase.from('email_schedule').update({
        status: 'failed', error_message: String(err),
      }).eq('id', row.id)
      results.push({ id: row.id, status: 'failed', error: String(err) })
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: due.length, results }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
