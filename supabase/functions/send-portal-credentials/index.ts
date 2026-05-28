// ════════════════════════════════════════════════════════════════════
// Edge Function : send-portal-credentials
// ════════════════════════════════════════════════════════════════════
//
// Envoie par email les identifiants de connexion au portail artisan.
// Utilisé quand un admin (fondateur) a généré/reset un mot de passe
// pour un artisan et veut le lui transmettre proprement plutôt que
// par SMS ou autre canal.
//
// Auth : nécessite un Bearer token valide (verify_jwt = true).
// Body : { to: string, full_name: string, plain_password: string,
//          portal_url?: string }
//
// La fonction NE STOCKE PAS le mot de passe — elle le relaie juste
// vers Resend. Le mot de passe est en clair dans l'email (limitation
// inhérente à l'envoi de credentials initiaux). Le mail invite
// explicitement l'artisan à le changer dès la 1ère connexion.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface Body {
  to?: string
  full_name?: string
  plain_password?: string
  portal_url?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }

  try {
    const body = (await req.json()) as Body
    const to = (body.to || '').trim()
    const fullName = (body.full_name || '').trim()
    const password = (body.plain_password || '').trim()
    const portalUrl = (body.portal_url || 'https://crm.celexia.fr/portal/login').trim()

    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return json(400, { error: 'invalid_email' })
    }
    if (!fullName || !password) {
      return json(400, { error: 'missing_fields', details: 'full_name and plain_password required' })
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) return json(500, { error: 'resend_not_configured' })

    const FROM = Deno.env.get('PORTAL_INVITE_FROM') || 'Celexia <antoine@celexia-pro.fr>'

    const subject = 'Vos identifiants de connexion au portail Celexia'
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937; line-height: 1.55;">
        <p>Bonjour ${escapeHtml(fullName)},</p>
        <p>Voici vos identifiants pour accéder à votre portail Celexia.</p>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em;">Email</p>
          <p style="margin: 0 0 14px 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px;"><strong>${escapeHtml(to)}</strong></p>
          <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em;">Mot de passe</p>
          <p style="margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px;"><strong>${escapeHtml(password)}</strong></p>
        </div>

        <p style="margin: 20px 0;">
          <a href="${escapeHtml(portalUrl)}" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">
            Me connecter au portail
          </a>
        </p>

        <p style="font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px;">
          <strong>Conseil sécurité :</strong> changez ce mot de passe dès votre première connexion depuis l'onglet « Paramètres » de votre portail.
        </p>

        <p style="font-size: 13px; color: #6b7280; margin-top: 16px;">
          Une question ? Répondez simplement à cet email.<br>
          L'équipe Celexia
        </p>
      </div>
    `.trim()

    const text = [
      `Bonjour ${fullName},`,
      ``,
      `Voici vos identifiants pour accéder à votre portail Celexia.`,
      ``,
      `Email : ${to}`,
      `Mot de passe : ${password}`,
      ``,
      `Lien de connexion : ${portalUrl}`,
      ``,
      `Conseil sécurité : changez ce mot de passe dès votre première connexion depuis l'onglet « Paramètres » de votre portail.`,
      ``,
      `Une question ? Répondez simplement à cet email.`,
      `L'équipe Celexia`,
    ].join('\n')

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject,
        html,
        text,
      }),
    })

    if (!resp.ok) {
      const errBody = await resp.text()
      console.error('Resend error:', resp.status, errBody)
      return json(502, { error: 'resend_failed', status: resp.status, details: errBody })
    }

    const result = await resp.json()
    return json(200, { ok: true, resend_id: result.id })
  } catch (e) {
    console.error('send-portal-credentials error:', e)
    return json(500, { error: 'internal_error', message: (e as Error).message })
  }
})
