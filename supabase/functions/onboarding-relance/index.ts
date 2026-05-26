import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Edge Function : onboarding-relance
 *
 * Déclencheur : cron pg_cron quotidien (migration 00104, 18:30 UTC = ~20h Paris).
 *
 * Pour chaque portal_onboarding NOT validated/rejected/abandoned :
 *   - Si jamais relancé ET portal_activated_at > 5h passées → envoyer
 *   - Si déjà relancé ET dernière relance > 20h passées → envoyer
 *   - Si relance_count >= 14 → stop (futile)
 *
 * L'email :
 *   - liste UNIQUEMENT ce qui manque réellement (live read)
 *   - inclut un magic link Supabase qui auto-loggue (sécurisé)
 *   - urgence graduée selon le nombre de jours depuis portal_activated_at
 *
 * Logs :
 *   - email_logs (type = portal_onboarding_relance)
 *   - portal_onboardings.relance_count + last_relance_at
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CRM_URL = Deno.env.get('CRM_BASE_URL') ?? 'https://crmcelexia.vercel.app'

const PSYCHO = [
  "Plus tôt ces points sont bouclés, plus tôt vos premiers clients arrivent.",
  "Vous avez signé pour un apport d'affaires, il ne manque que ça pour qu'on commence à vous envoyer du chiffre.",
  "Le système est prêt à tourner pour vous, dès que ces points sont validés on lance.",
  "L'effort qu'il reste est minime, mais il bloque la mise en place.",
]

interface OnboardingRow {
  id: string
  client_id: string
  status: string
  contract_signed: boolean
  payment_proof_uploaded: boolean
  gmb_access_confirmed: boolean
  rc_pro_uploaded: boolean
  kbis_uploaded: boolean
  relance_count: number
  last_relance_at: string | null
  clients: {
    id: string
    contact_email: string
    contact_firstname: string | null
    contact_name: string | null
    company_name: string
    user_id: string | null
    portal_activated_at: string | null
  } | null
}

function getMissingSteps(o: OnboardingRow): string[] {
  const missing: string[] = []
  if (!o.contract_signed)         missing.push("La signature du contrat (depuis votre portail, onglet Onboarding)")
  if (!o.payment_proof_uploaded)  missing.push("Le justificatif de virement pour le budget publicitaire")
  if (!o.gmb_access_confirmed)    missing.push("La validation de l'accès à votre fiche Google My Business")
  if (!o.rc_pro_uploaded)         missing.push("Votre attestation RC Pro à uploader")
  if (!o.kbis_uploaded)           missing.push("Votre Kbis (de moins de 3 mois)")
  return missing
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
  )
}

/**
 * Ton de la relance : neutre, sans deadline ni menace de désactivation.
 * On rappelle juste ce qui manque + l'invitation à finaliser rapidement.
 * Aucune mention de "48h", "dernière relance", "fermeture", "récupère votre créneau".
 */
function reminderTone(_daysSinceActivated: number, _relanceCount: number) {
  return {
    line: "Faites-le au plus vite pour qu'on puisse lancer la mise en place de votre côté.",
  }
}

function buildEmail(opts: {
  first_name: string
  missing: string[]
  daysSinceActivated: number
  relanceCount: number
  loginEmail: string
  magicLink: string
}) {
  const { first_name, missing, daysSinceActivated, relanceCount, loginEmail, magicLink } = opts
  const n = missing.length
  const psycho = PSYCHO[relanceCount % PSYCHO.length]
  const u = reminderTone(daysSinceActivated, relanceCount)

  // Subject neutre — ne mentionne ni jour, ni deadline, ni "dernière relance"
  const subject = `${first_name}, il reste ${n} étape${n > 1 ? 's' : ''} pour démarrer`

  const itemsHtml = missing.map(m =>
    `<tr><td style="padding:6px 0 6px 8px;border-left:3px solid #d97706;font-size:14px;line-height:1.5;color:#0F172A">${escapeHtml(m)}</td></tr>`
  ).join('')
  const itemsText = missing.map(m => `  - ${m}`).join('\n')
  // Bloc d'invitation neutre (gris), pas rouge — pas d'effet urgence visuelle
  const urgBg = '#f1f5f9'
  const urgFg = '#475569'

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0F172A">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:24px 12px"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
<tr><td style="background:#7C3AED;color:#ffffff;padding:24px 28px">
<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.85">Celexia, apport d'affaires</div>
<div style="font-size:22px;font-weight:700;margin-top:6px;line-height:1.3">Bonjour ${escapeHtml(first_name)},</div>
</td></tr>
<tr><td style="padding:24px 28px">
<p style="font-size:15px;line-height:1.6;margin:0 0 16px">Je vous envoie cet email car il nous manque encore <strong>${n} élément${n > 1 ? 's' : ''}</strong> pour finaliser votre démarrage&nbsp;:</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fef3c7;border-radius:6px;padding:10px 12px;margin:0 0 18px">${itemsHtml}</table>
<p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 16px;font-style:italic">${escapeHtml(psycho)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${urgBg};border-radius:8px;margin:0 0 24px">
<tr><td style="padding:14px 16px;font-size:14px;line-height:1.5;color:${urgFg}">${escapeHtml(u.line)}</td></tr></table>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;border-radius:8px;margin:0 0 24px"><tr><td style="padding:16px;font-size:13px;line-height:1.6;color:#0F172A">
<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:8px">Votre accès direct</div>
<div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:13px;background:#ffffff;padding:10px 12px;border-radius:6px;margin-bottom:8px"><strong>Email&nbsp;:</strong> ${escapeHtml(loginEmail)}</div>
<div style="font-size:12px;color:#64748b">Cliquez le bouton ci-dessous, vous serez connecté automatiquement sans avoir à ressaisir votre mot de passe.</div>
</td></tr></table>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td align="center" style="padding:0 0 8px">
<a href="${escapeHtml(magicLink)}" style="display:inline-block;background:#7C3AED;color:#ffffff;padding:14px 28px;border-radius:8px;font-weight:600;text-decoration:none;font-size:15px">Compléter mon onboarding</a>
</td></tr>
<tr><td align="center" style="padding:0 0 24px;font-size:12px;color:#94a3b8">
<a href="${escapeHtml(magicLink)}" style="color:#7C3AED;text-decoration:none;word-break:break-all">${escapeHtml(magicLink.length > 60 ? magicLink.slice(0, 60) + '…' : magicLink)}</a>
</td></tr></table>

<p style="font-size:13px;color:#64748b;line-height:1.6;margin:0;border-top:1px solid #e2e8f0;padding-top:18px">
Si vous avez une question, répondez simplement à cet email.<br><br>
<strong style="color:#0F172A">Thomas</strong><br>Celexia
</p></td></tr></table></td></tr></table></body></html>`

  const text = `Bonjour ${first_name},

Je vous envoie cet email car il nous manque encore ${n} élément${n > 1 ? 's' : ''} pour finaliser votre démarrage :

${itemsText}

${psycho}

${u.line}

----------------------------------------
Votre accès direct :
  Email : ${loginEmail}
  Lien : ${magicLink}
----------------------------------------

Si vous avez une question, répondez à cet email.

Thomas
Celexia
`

  return { subject, html, text }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Garde-fou week-end : refuse l'envoi samedi (6) et dimanche (0).
  // Utilise l'heure Paris pour décider, pas UTC (un trigger samedi 22h UTC =
  // dimanche 00h Paris, donc on doit checker en Paris time).
  const parisFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' })
  const parisDay = parisFmt.format(new Date())  // "Sat", "Sun", etc.
  if (parisDay === 'Sat' || parisDay === 'Sun') {
    return new Response(JSON.stringify({ ok: true, skipped: 'weekend_paris', day: parisDay }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
  const supabase = createClient(SUPABASE_URL, SERVICE)

  if (!RESEND_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // 1. Liste les onboardings actifs
  const { data: rows, error } = await supabase
    .from('portal_onboardings')
    .select(`
      id, client_id, status,
      contract_signed, payment_proof_uploaded, gmb_access_confirmed,
      rc_pro_uploaded, kbis_uploaded,
      relance_count, last_relance_at,
      clients (
        id, contact_email, contact_firstname, contact_name, company_name,
        user_id, portal_activated_at
      )
    `)
    .not('status', 'in', '("validated","rejected","abandoned")')
    .lt('relance_count', 14)

  if (error) {
    return new Response(JSON.stringify({ error: 'query_failed', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const now = Date.now()
  const HOUR = 3600 * 1000
  const results: Array<Record<string, unknown>> = []
  let sent = 0
  let skipped_recent = 0
  let skipped_no_missing = 0
  let skipped_no_email = 0
  let skipped_too_recent_creation = 0
  let errors = 0

  for (const row of (rows ?? []) as unknown as OnboardingRow[]) {
    const client = row.clients
    if (!client || !client.contact_email) {
      skipped_no_email++
      continue
    }
    const portalActivatedAt = client.portal_activated_at ? Date.parse(client.portal_activated_at) : null
    if (!portalActivatedAt) {
      // Portail jamais activé, on saute
      skipped_too_recent_creation++
      continue
    }
    const hoursSinceActivated = (now - portalActivatedAt) / HOUR
    const daysSinceActivated = Math.floor(hoursSinceActivated / 24)

    // Garde-fous timing
    if (row.last_relance_at) {
      const hoursSinceLast = (now - Date.parse(row.last_relance_at)) / HOUR
      if (hoursSinceLast < 20) {
        skipped_recent++
        continue
      }
    } else {
      // Jamais relancé : il faut au moins 5h depuis l'activation
      if (hoursSinceActivated < 5) {
        skipped_too_recent_creation++
        continue
      }
    }

    // Steps manquantes (read live, donc reflète l'état actuel)
    const missing = getMissingSteps(row)
    if (missing.length === 0) {
      // Tout est fait côté artisan, attente validation Celexia
      // On envoie quand même un mail "validation en cours" mais à fréquence réduite (toutes les 3 jours)
      if (row.last_relance_at) {
        const hoursSinceLast = (now - Date.parse(row.last_relance_at)) / HOUR
        if (hoursSinceLast < 72) {
          skipped_no_missing++
          continue
        }
      }
      missing.push("La validation finale de notre équipe (dès que vos étapes sont complétées de votre côté)")
    }

    // Magic link pour auto-login
    let magicLink = `${CRM_URL}/portal/auth`
    try {
      const { data: linkData } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: client.contact_email,
        options: { redirectTo: `${CRM_URL}/portal/onboarding` },
      })
      if (linkData?.properties?.action_link) {
        magicLink = linkData.properties.action_link
      }
    } catch (e) {
      console.error('generateLink failed for', client.contact_email, e)
    }

    const firstName = client.contact_firstname || client.contact_name || 'cher artisan'
    const { subject, html, text } = buildEmail({
      first_name: firstName,
      missing,
      daysSinceActivated,
      relanceCount: row.relance_count,
      loginEmail: client.contact_email,
      magicLink,
    })

    // Envoi via Resend
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Thomas <thomas@celexia-pro.fr>',
          to: [client.contact_email],
          subject,
          html,
          text,
          reply_to: 'agence.celexia@gmail.com',
        }),
      })
      if (!r.ok) {
        const errBody = await r.text()
        errors++
        console.error('Resend failed', r.status, errBody)
        results.push({ client_id: client.id, status: 'failed', http: r.status, error: errBody.slice(0, 200) })
        continue
      }
      const rj = await r.json()
      // Update tracking
      await supabase
        .from('portal_onboardings')
        .update({
          relance_count: row.relance_count + 1,
          last_relance_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      // Log
      await supabase.from('email_logs').insert({
        type: 'portal_onboarding_relance',
        recipient_email: client.contact_email,
        client_id: client.id,
        subject,
        status: 'sent',
        metadata: {
          resend_id: rj.id,
          missing_count: missing.length,
          missing_steps: missing,
          days_since_activated: daysSinceActivated,
          relance_number: row.relance_count + 1,
        },
      })
      sent++
      results.push({ client_id: client.id, status: 'sent', resend_id: rj.id, days: daysSinceActivated, missing: missing.length })
    } catch (e) {
      errors++
      results.push({ client_id: client.id, status: 'error', error: String(e) })
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    sent, errors,
    skipped: {
      recent_relance: skipped_recent,
      no_missing_step: skipped_no_missing,
      no_email: skipped_no_email,
      too_recent_creation: skipped_too_recent_creation,
    },
    results,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
