import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Edge Function : send-review-batch
 *
 * Déclenché par le front portail artisan quand il clique "Lancer la campagne".
 * Input : { campaign_id: string }
 *
 * Workflow :
 *  1. Vérifie que l'appelant est bien le owner de la campagne (RLS via JWT)
 *  2. Met campaign.status = 'launching', launched_at = now()
 *  3. Pour chaque review_request en pending :
 *     - Compose email perso (template HTML pro + texte fallback)
 *     - Envoie via Resend
 *     - Update status = 'sent', sent_at, resend_id
 *  4. Met campaign.status = 'sent' (ou 'failed' si tout a planté)
 *  5. Update les counters
 *
 * Conformité : pas de review gating, lien direct Google.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CRM_BASE = Deno.env.get('CRM_BASE_URL') ?? 'https://crmcelexia.vercel.app'
// Domaine d'envoi — sera changé pour le domaine review dédié quand validé chez Resend
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

function buildEmail(opts: {
  firstName: string
  companyName: string
  projectContext: string | null
  reviewLink: string
  unsubscribeLink: string
  customIntro: string | null
}) {
  const { firstName, companyName, projectContext, reviewLink, unsubscribeLink, customIntro } = opts

  const subject = `Merci ${firstName}, votre avis compte pour ${companyName}`

  const projectLine = projectContext
    ? `pour <strong>${escapeHtml(projectContext)}</strong>`
    : 'pour votre projet'

  const introHtml = customIntro
    ? escapeHtml(customIntro)
    : `On espère que tout s'est bien passé ${projectLine} et que vous êtes satisfait du travail.`

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0F172A">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:32px 12px"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
<tr><td style="background:#0F172A;color:#ffffff;padding:28px 32px">
<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;opacity:0.7">${escapeHtml(companyName)}</div>
<div style="font-size:22px;font-weight:700;margin-top:6px;line-height:1.3">Bonjour ${escapeHtml(firstName)},</div>
</td></tr>
<tr><td style="padding:28px 32px">
<p style="font-size:15px;line-height:1.6;margin:0 0 16px">${introHtml}</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 20px">Un avis sur Google nous aide énormément à continuer à servir d'autres particuliers comme vous. <strong>Ça prend 2 minutes</strong> et c'est précieux pour nous.</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0">
<tr><td align="center">
<a href="${escapeHtml(reviewLink)}" style="display:inline-block;background:#FFC107;color:#0F172A;padding:16px 32px;border-radius:8px;font-weight:700;text-decoration:none;font-size:16px">★ Laisser un avis sur Google</a>
</td></tr>
</table>

<p style="font-size:14px;line-height:1.6;color:#475569;margin:24px 0 0">
Vous n'avez pas été satisfait à 100% ? Répondez simplement à cet email, on règle ça avant tout.
</p>

<p style="font-size:14px;line-height:1.6;color:#0F172A;margin:24px 0 0;border-top:1px solid #e2e8f0;padding-top:20px">
Merci d'avance,<br><strong>${escapeHtml(companyName)}</strong>
</p>

<p style="font-size:11px;color:#94a3b8;line-height:1.5;margin:24px 0 0;border-top:1px solid #e2e8f0;padding-top:14px;text-align:center">
Vous recevez cet email parce que ${escapeHtml(companyName)} vous a contacté suite à une prestation.<br>
<a href="${escapeHtml(unsubscribeLink)}" style="color:#94a3b8">Ne plus recevoir d'emails</a>
</p>
</td></tr></table>
</td></tr></table>
</body></html>`

  const text = `Bonjour ${firstName},

${customIntro || `On espère que tout s'est bien passé ${projectContext ? `pour ${projectContext}` : 'pour votre projet'} et que vous êtes satisfait du travail.`}

Un avis sur Google nous aide énormément à continuer à servir d'autres particuliers comme vous. Ça prend 2 minutes et c'est précieux pour nous.

Laisser un avis : ${reviewLink}

Vous n'avez pas été satisfait à 100% ? Répondez simplement à cet email, on règle ça avant tout.

Merci d'avance,
${companyName}

---
Vous recevez cet email parce que ${companyName} vous a contacté suite à une prestation.
Ne plus recevoir : ${unsubscribeLink}
`
  return { subject, html, text }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
  const supabase = createClient(SUPABASE_URL, SERVICE)

  // Auth
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'auth_required' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const callerToken = authHeader.replace('Bearer ', '')
  const { data: { user: caller } } = await supabase.auth.getUser(callerToken)
  if (!caller) {
    return new Response(JSON.stringify({ error: 'invalid_token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  let payload: { campaign_id?: string }
  try { payload = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers: corsHeaders })
  }
  if (!payload.campaign_id) {
    return new Response(JSON.stringify({ error: 'campaign_id_required' }), { status: 400, headers: corsHeaders })
  }

  // Fetch campaign + verify ownership
  const { data: campaign, error: cErr } = await supabase
    .from('review_campaigns')
    .select('id, client_id, google_review_url, custom_intro, status, clients(id, company_name, user_id)')
    .eq('id', payload.campaign_id)
    .single()

  if (cErr || !campaign) {
    return new Response(JSON.stringify({ error: 'campaign_not_found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const client = (campaign.clients as unknown as { id: string; company_name: string; user_id: string | null })
  if (!client || (client.user_id !== caller.id)) {
    // Vérif ownership : caller doit être l'artisan ou un founder
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()
    if (!callerProfile || !['fondateur', 'co_fondateur'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  if (campaign.status === 'sent') {
    return new Response(JSON.stringify({ error: 'already_sent' }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Set launching
  await supabase
    .from('review_campaigns')
    .update({ status: 'launching', launched_at: new Date().toISOString() })
    .eq('id', campaign.id)

  // From address — slug du nom artisan @ FROM_DOMAIN
  const slug = slugifyCompany(client.company_name) || 'celexia'
  const fromAddress = `${slug}@${FROM_DOMAIN}`
  const fromName = client.company_name

  // Process pending requests
  const { data: requests } = await supabase
    .from('review_requests')
    .select('id, recipient_email, recipient_firstname, recipient_name, project_context, token, status')
    .eq('campaign_id', campaign.id)
    .eq('status', 'pending')

  let sent = 0
  let failed = 0
  for (const req of (requests ?? [])) {
    const firstName = req.recipient_firstname || req.recipient_name || 'cher client'
    const reviewLink = `${CRM_BASE}/r/${req.token}`
    const unsubscribeLink = `${CRM_BASE}/r/${req.token}/unsubscribe`

    const { subject, html, text } = buildEmail({
      firstName,
      companyName: client.company_name,
      projectContext: req.project_context,
      reviewLink,
      unsubscribeLink,
      customIntro: campaign.custom_intro,
    })

    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${fromName} <${fromAddress}>`,
          to: [req.recipient_email],
          subject,
          html,
          text,
          reply_to: req.recipient_email,  // les replies arrivent à l'artisan (à reconfigurer si on veut router via Celexia)
        }),
      })
      if (!r.ok) {
        const errText = await r.text()
        await supabase.from('review_requests').update({
          status: 'failed', error_message: errText.slice(0, 500),
        }).eq('id', req.id)
        failed++
        continue
      }
      const rj = await r.json()
      await supabase.from('review_requests').update({
        status: 'sent', sent_at: new Date().toISOString(), resend_id: rj.id,
      }).eq('id', req.id)
      sent++
    } catch (e) {
      await supabase.from('review_requests').update({
        status: 'failed', error_message: String(e).slice(0, 500),
      }).eq('id', req.id)
      failed++
    }
  }

  // Final campaign status
  await supabase
    .from('review_campaigns')
    .update({
      status: failed === requests?.length ? 'failed' : 'sent',
      total_sent: sent,
      total_failed: failed,
    })
    .eq('id', campaign.id)

  return new Response(JSON.stringify({
    ok: true,
    campaign_id: campaign.id,
    sent, failed,
    total: requests?.length ?? 0,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
