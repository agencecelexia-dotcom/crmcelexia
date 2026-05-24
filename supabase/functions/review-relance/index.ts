import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Edge Function : review-relance
 *
 * Déclencheur : pg_cron quotidien à 09:30 UTC (~11h30 Paris).
 *
 * Pour chaque review_request en `status = sent` AND `clicked_at IS NULL`
 * AND `relance_count < 2` :
 *   - Relance #1 : relance_count = 0 ET sent_at < now() - 3 jours
 *   - Relance #2 : relance_count = 1 ET sent_at < now() - 7 jours
 *
 * Templates différents pour relance #1 (rappel doux) et #2 (dernière fois).
 * Stop si l'utilisateur clique entre-temps (clicked_at devient non-null).
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CRM_BASE = Deno.env.get('CRM_BASE_URL') ?? 'https://crmcelexia.vercel.app'
const FROM_DOMAIN = Deno.env.get('REVIEW_FROM_DOMAIN') ?? 'celexia-pro.fr'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function slugifyCompany(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function pickGreeting(firstName: string | null): string {
  const fn = (firstName || '').trim()
  if (fn && fn.length >= 2) return `Bonjour ${fn},`
  return `Bonjour,`
}

/**
 * Relance #1 (J+3) — rappel doux, court.
 */
function buildEmailRelance1(opts: {
  firstName: string | null
  companyName: string
  reviewLink: string
  unsubscribeLink: string
}) {
  const { firstName, companyName, reviewLink, unsubscribeLink } = opts
  const greeting = pickGreeting(firstName)
  const fn = (firstName || '').trim()
  const subject = fn
    ? `${fn}, un petit rappel`
    : `Un petit rappel — ${companyName}`

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0F172A">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:32px 12px"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
<tr><td style="padding:28px 32px 0">
<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#64748b">${escapeHtml(companyName)}</div>
<div style="font-size:20px;font-weight:600;margin-top:8px;color:#0F172A;line-height:1.3">${escapeHtml(greeting)}</div>
</td></tr>
<tr><td style="padding:20px 32px 8px">
<p style="font-size:15px;line-height:1.65;margin:0 0 14px;color:#334155">
Je vous ai envoyé un email il y a quelques jours, je profite de celui-ci pour vous relancer gentiment.
</p>
<p style="font-size:15px;line-height:1.65;margin:0 0 24px;color:#334155">
Si vous avez 2 minutes pour nous dire comment s'est passée votre expérience avec ${escapeHtml(companyName)}, ça nous serait précieux.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 24px">
<tr><td align="center">
<a href="${escapeHtml(reviewLink)}" style="display:inline-block;background:#0F172A;color:#ffffff;padding:14px 32px;border-radius:8px;font-weight:600;text-decoration:none;font-size:15px">Partager mon expérience</a>
</td></tr>
</table>

<p style="font-size:14px;line-height:1.6;color:#0F172A;margin:0;border-top:1px solid #e2e8f0;padding-top:20px">
Merci,<br><strong>${escapeHtml(companyName)}</strong>
</p>
</td></tr>
<tr><td style="padding:18px 32px 28px">
<p style="font-size:11px;color:#94a3b8;line-height:1.5;margin:0;text-align:center;border-top:1px solid #f1f5f9;padding-top:14px">
<a href="${escapeHtml(unsubscribeLink)}" style="color:#94a3b8;text-decoration:underline">Ne plus recevoir d'emails de ${escapeHtml(companyName)}</a>
</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`

  const text = `${greeting}

Je vous ai envoyé un email il y a quelques jours, je profite de celui-ci pour vous relancer gentiment.

Si vous avez 2 minutes pour nous dire comment s'est passée votre expérience avec ${companyName}, ça nous serait précieux.

Partager mon expérience : ${reviewLink}

Merci,
${companyName}

---
Ne plus recevoir : ${unsubscribeLink}
`
  return { subject, html, text }
}

/**
 * Relance #2 (J+7) — dernière fois, ton encore plus léger.
 */
function buildEmailRelance2(opts: {
  firstName: string | null
  companyName: string
  reviewLink: string
  unsubscribeLink: string
}) {
  const { firstName, companyName, reviewLink, unsubscribeLink } = opts
  const greeting = pickGreeting(firstName)
  const fn = (firstName || '').trim()
  const subject = fn
    ? `${fn}, dernière relance promis`
    : `Dernière relance — ${companyName}`

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0F172A">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:32px 12px"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
<tr><td style="padding:28px 32px 0">
<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#64748b">${escapeHtml(companyName)}</div>
<div style="font-size:20px;font-weight:600;margin-top:8px;color:#0F172A;line-height:1.3">${escapeHtml(greeting)}</div>
</td></tr>
<tr><td style="padding:20px 32px 8px">
<p style="font-size:15px;line-height:1.65;margin:0 0 14px;color:#334155">
Je n'insiste pas plus, c'est la dernière fois que je vous écris à ce sujet.
</p>
<p style="font-size:15px;line-height:1.65;margin:0 0 24px;color:#334155">
Si vous avez 2 minutes pour partager votre retour, c'est par ici. Sinon aucun souci, on n'en reparle plus.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 24px">
<tr><td align="center">
<a href="${escapeHtml(reviewLink)}" style="display:inline-block;background:#0F172A;color:#ffffff;padding:14px 32px;border-radius:8px;font-weight:600;text-decoration:none;font-size:15px">Partager mon expérience</a>
</td></tr>
</table>

<p style="font-size:14px;line-height:1.6;color:#0F172A;margin:0;border-top:1px solid #e2e8f0;padding-top:20px">
Merci dans tous les cas,<br><strong>${escapeHtml(companyName)}</strong>
</p>
</td></tr>
<tr><td style="padding:18px 32px 28px">
<p style="font-size:11px;color:#94a3b8;line-height:1.5;margin:0;text-align:center;border-top:1px solid #f1f5f9;padding-top:14px">
<a href="${escapeHtml(unsubscribeLink)}" style="color:#94a3b8;text-decoration:underline">Ne plus recevoir d'emails de ${escapeHtml(companyName)}</a>
</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`

  const text = `${greeting}

Je n'insiste pas plus, c'est la dernière fois que je vous écris à ce sujet.

Si vous avez 2 minutes pour partager votre retour, c'est par ici. Sinon aucun souci, on n'en reparle plus.

Partager mon expérience : ${reviewLink}

Merci dans tous les cas,
${companyName}

---
Ne plus recevoir : ${unsubscribeLink}
`
  return { subject, html, text }
}

interface ReqRow {
  id: string
  campaign_id: string
  recipient_email: string
  recipient_firstname: string | null
  recipient_name: string | null
  token: string
  status: string
  sent_at: string | null
  clicked_at: string | null
  relance_count: number
  review_campaigns: {
    id: string
    status: string
    clients: { id: string; company_name: string } | null
  } | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Garde-fou week-end : pas d'envoi samedi/dimanche (heure Paris).
  const parisFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' })
  const parisDay = parisFmt.format(new Date())
  if (parisDay === 'Sat' || parisDay === 'Sun') {
    return new Response(JSON.stringify({ ok: true, skipped: 'weekend_paris', day: parisDay }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
  if (!RESEND_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY missing' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const supabase = createClient(SUPABASE_URL, SERVICE)

  // Liste les requests éligibles à une relance.
  // On laisse Postgres filtrer le plus possible pour économiser de la mémoire.
  const { data: rows, error } = await supabase
    .from('review_requests')
    .select(`
      id, campaign_id, recipient_email, recipient_firstname, recipient_name,
      token, status, sent_at, clicked_at, relance_count,
      review_campaigns!inner (
        id, status, clients!inner ( id, company_name )
      )
    `)
    .eq('status', 'sent')
    .is('clicked_at', null)
    .lt('relance_count', 2)
    .not('sent_at', 'is', null)

  if (error) {
    return new Response(JSON.stringify({ error: 'query_failed', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const now = Date.now()
  const DAY = 86400 * 1000
  let sent_relance1 = 0
  let sent_relance2 = 0
  let errors = 0
  let skipped_too_soon = 0
  const results: Array<Record<string, unknown>> = []

  for (const row of (rows ?? []) as unknown as ReqRow[]) {
    if (!row.sent_at) continue
    const sentTs = Date.parse(row.sent_at)
    const daysSinceSent = (now - sentTs) / DAY

    // Décide quelle relance envoyer
    let which: 1 | 2 | null = null
    if (row.relance_count === 0 && daysSinceSent >= 3) {
      which = 1
    } else if (row.relance_count === 1 && daysSinceSent >= 7) {
      which = 2
    }
    if (which === null) {
      skipped_too_soon++
      continue
    }

    const company = row.review_campaigns?.clients?.company_name ?? 'votre prestataire'
    if (!row.review_campaigns?.clients) continue
    if (row.review_campaigns.status !== 'sent') continue // campagne pas active

    const reviewLink = `${CRM_BASE}/r/${row.token}`
    const unsubscribeLink = `${CRM_BASE}/r/${row.token}/unsubscribe`
    const { subject, html, text } = which === 1
      ? buildEmailRelance1({ firstName: row.recipient_firstname, companyName: company, reviewLink, unsubscribeLink })
      : buildEmailRelance2({ firstName: row.recipient_firstname, companyName: company, reviewLink, unsubscribeLink })

    const slug = slugifyCompany(company) || 'celexia'
    const fromAddress = `${slug}@${FROM_DOMAIN}`

    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${company} <${fromAddress}>`,
          to: [row.recipient_email],
          subject,
          html,
          text,
          reply_to: row.recipient_email,
        }),
      })
      if (!r.ok) {
        errors++
        const errBody = await r.text()
        results.push({ id: row.id, which, status: 'failed', error: errBody.slice(0, 200) })
        continue
      }
      const rj = await r.json()

      await supabase.from('review_requests').update({
        relance_count: row.relance_count + 1,
        last_relance_at: new Date().toISOString(),
      }).eq('id', row.id)

      if (which === 1) sent_relance1++
      else sent_relance2++

      results.push({
        id: row.id, which, email: row.recipient_email,
        days_since_sent: Math.round(daysSinceSent * 10) / 10,
        resend_id: rj.id,
      })
    } catch (e) {
      errors++
      results.push({ id: row.id, which, status: 'error', error: String(e) })
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    sent_relance1, sent_relance2, errors, skipped_too_soon,
    total_eligible: rows?.length ?? 0,
    results: results.slice(0, 100),
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
