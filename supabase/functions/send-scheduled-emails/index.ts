// Edge function : appelée par cron N8N toutes les 5 min.
// Traite les emails programmés (email_schedule) dont scheduled_at <= NOW().
// Envoie via Resend, met à jour le status.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const RESEND_URL = 'https://api.resend.com/emails'

interface EmailScheduleRow {
  id: string
  rdv_id: string | null
  prospect_id: string | null
  recipient_email: string
  recipient_name: string | null
  email_type: string
  scheduled_at: string
  payload: Record<string, unknown>
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

const FROM_FALLBACK = 'onboarding@resend.dev' // si domaine pas vérifié dans Resend

/** Remplace {{var_name}} dans une string par les valeurs */
function fillTemplate(tpl: string, vars: Record<string, string | number | null | undefined>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_m, key) => {
    const v = vars[key]
    return v === null || v === undefined ? '' : String(v)
  })
}

/** Maps profession (FR free text) to a canonical sector for case_study lookup */
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

/** Maps sector slug to human label */
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

/** Format date FR : "jeudi 30 avril 2026" */
function formatDateFR(iso: string): { day: string; full: string; time: string; relative: string } {
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

  // Relative
  const now = new Date()
  const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  let relative = 'bientôt'
  if (diffDays === 0) relative = "aujourd'hui"
  else if (diffDays === 1) relative = 'demain'
  else if (diffDays === -1) relative = 'hier'
  else if (diffDays > 1 && diffDays <= 7) relative = `dans ${diffDays} jours`
  else if (diffDays > 7) relative = `dans ${Math.ceil(diffDays / 7)} semaines`

  return { day, full, time, relative }
}

/** Format short money : 124000 → "124k€" */
function formatMoneyShort(n: number | null | undefined): string {
  if (!n) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`
  if (n >= 1000) return `${Math.round(n / 1000)}k€`
  return `${n}€`
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

  // 2. Charger tous les templates en cache
  const { data: tpls } = await supabase
    .from('email_templates')
    .select('slug, subject_template, html_template, from_name, from_email, reply_to')
    .eq('is_active', true)

  const tplBySlug = new Map<string, EmailTemplate>()
  for (const t of tpls ?? []) tplBySlug.set(t.slug, t as EmailTemplate)

  const results: Array<{ id: string; status: string; error?: string; resend_id?: string }> = []

  // 3. Pour chaque email dû, construire et envoyer
  for (const row of due as EmailScheduleRow[]) {
    try {
      // Mark as in-flight (incrément attempt_count)
      await supabase
        .from('email_schedule')
        .update({ attempt_count: row.attempt_count + 1 })
        .eq('id', row.id)

      // Déterminer template slug
      const tplSlug = row.email_type
      const tpl = tplBySlug.get(tplSlug)
      if (!tpl) {
        await supabase.from('email_schedule').update({
          status: 'failed',
          error_message: `No template for slug: ${tplSlug}`,
        }).eq('id', row.id)
        results.push({ id: row.id, status: 'failed', error: 'no_template' })
        continue
      }

      // Charger les datas associées (prospect, rdv, case_study)
      const vars: Record<string, string | number | null | undefined> = {}

      // Prospect
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
          const sector = professionToSector(p.profession)
          vars.prospect_sector_label = sectorLabel(sector)
          vars.prospect_sector_singular = sectorLabel(sector)

          // Case study lookup pour Email 2
          if (tplSlug === 'rdv_case_study') {
            let { data: cs } = await supabase
              .from('case_studies')
              .select('*')
              .eq('sector', sector)
              .eq('is_active', true)
              .limit(1)
              .maybeSingle()
            // Fallback sur 'autre' si pas trouvé
            if (!cs) {
              const { data: csFb } = await supabase
                .from('case_studies')
                .select('*')
                .eq('sector', 'autre')
                .eq('is_active', true)
                .limit(1)
                .maybeSingle()
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
        }
      }

      // RDV
      if (row.rdv_id) {
        const { data: rdv } = await supabase
          .from('rendez_vous')
          .select('scheduled_at, meeting_url, duration_minutes')
          .eq('id', row.rdv_id)
          .single()
        if (rdv) {
          const fmt = formatDateFR(rdv.scheduled_at)
          vars.rdv_date_human = fmt.full
          vars.rdv_day_human = fmt.day
          vars.rdv_time_human = fmt.time
          vars.rdv_when_relative = fmt.relative
          vars.rdv_duration = String(rdv.duration_minutes ?? 30)
          vars.meeting_url = rdv.meeting_url ?? 'https://cal.com/celexia/30min'
        }
      }

      // Defaults Antoine
      vars.antoine_phone = '+33612345678'
      vars.antoine_phone_display = '06 12 34 56 78'
      vars.loom_url = 'https://www.loom.com/share/celexia-presentation'
      vars.reschedule_url = 'https://cal.com/celexia/30min'

      // Override avec payload custom si présent
      if (row.payload) {
        for (const [k, v] of Object.entries(row.payload)) {
          if (v !== null && v !== undefined) vars[k] = v as string | number
        }
      }

      const subject = fillTemplate(tpl.subject_template, vars)
      const html = fillTemplate(tpl.html_template, vars)

      // Envoi via Resend (avec fallback si domain pas vérifié)
      const fromPrimary = `${tpl.from_name} <${tpl.from_email}>`
      let resp = await fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromPrimary,
          to: [row.recipient_email],
          subject,
          html,
          reply_to: tpl.reply_to,
        }),
      })

      if (resp.status === 403) {
        // Domain pas vérifié, fallback
        resp = await fetch(RESEND_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${tpl.from_name} <${FROM_FALLBACK}>`,
            to: [row.recipient_email],
            subject,
            html,
            reply_to: tpl.reply_to,
          }),
        })
      }

      const respBody = await resp.json() as { id?: string; message?: string }

      if (resp.status >= 400) {
        await supabase.from('email_schedule').update({
          status: 'failed',
          error_message: respBody.message || `HTTP ${resp.status}`,
        }).eq('id', row.id)
        results.push({ id: row.id, status: 'failed', error: respBody.message })
      } else {
        await supabase.from('email_schedule').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          resend_id: respBody.id ?? null,
        }).eq('id', row.id)
        results.push({ id: row.id, status: 'sent', resend_id: respBody.id })
      }
    } catch (err) {
      await supabase.from('email_schedule').update({
        status: 'failed',
        error_message: String(err),
      }).eq('id', row.id)
      results.push({ id: row.id, status: 'failed', error: String(err) })
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: due.length, results }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
