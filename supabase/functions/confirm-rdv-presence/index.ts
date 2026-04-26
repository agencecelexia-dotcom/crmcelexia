// Edge function : valide le token de confirmation RDV et marque rdv_confirmations.confirmed_at
// Appelée par GET /functions/v1/confirm-rdv-presence?token=xxx
// Retourne une page HTML de confirmation visuelle.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function htmlPage(opts: { variant: 'success' | 'expired' | 'invalid' | 'already', rdv_date?: string, rdv_time?: string }): string {
  const { variant, rdv_date, rdv_time } = opts
  const cfg = {
    success: {
      icon: '✓',
      iconBg: '#10B981',
      title: 'Présence confirmée',
      subtitle: rdv_date && rdv_time
        ? `À très bientôt ! Rendez-vous le ${rdv_date} à ${rdv_time}.`
        : 'Merci, votre présence est notée. À très bientôt.',
      hint: 'Vous pouvez fermer cette fenêtre.',
    },
    already: {
      icon: '✓',
      iconBg: '#10B981',
      title: 'Déjà confirmé',
      subtitle: rdv_date && rdv_time
        ? `Votre présence est déjà enregistrée pour le ${rdv_date} à ${rdv_time}.`
        : 'Votre présence est déjà enregistrée.',
      hint: 'Aucune action supplémentaire requise.',
    },
    expired: {
      icon: '!',
      iconBg: '#F59E0B',
      title: 'Lien expiré',
      subtitle: 'Ce lien de confirmation a expiré.',
      hint: 'Contactez-nous à agence.celexia@gmail.com pour reprogrammer.',
    },
    invalid: {
      icon: '×',
      iconBg: '#EF4444',
      title: 'Lien invalide',
      subtitle: 'Ce lien de confirmation n\'est pas valide.',
      hint: 'Vérifiez le lien dans votre email ou contactez-nous.',
    },
  }[variant]

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${cfg.title} · Celexia</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
      background: #FAFAFA;
      color: #0F172A;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      line-height: 1.5;
    }
    .card {
      max-width: 460px;
      width: 100%;
      background: #FFFFFF;
      border-radius: 16px;
      padding: 56px 40px;
      text-align: center;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(15,23,42,0.06);
    }
    .icon {
      width: 64px; height: 64px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 24px;
      background: ${cfg.iconBg};
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      color: #0F172A;
      letter-spacing: -0.01em;
      margin-bottom: 12px;
    }
    p.subtitle {
      font-size: 15px;
      color: #475569;
      margin-bottom: 24px;
    }
    p.hint {
      font-size: 13px;
      color: #94A3B8;
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #F1F5F9;
    }
    .brand {
      margin-top: 32px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #94A3B8;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${cfg.icon}</div>
    <h1>${cfg.title}</h1>
    <p class="subtitle">${cfg.subtitle}</p>
    <p class="hint">${cfg.hint}</p>
    <div class="brand">Celexia</div>
  </div>
</body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token || token.length < 16) {
    return new Response(htmlPage({ variant: 'invalid' }), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Look up the token
  const { data: row, error } = await supabase
    .from('rdv_confirmations')
    .select('id, rdv_id, confirmed_at, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (error || !row) {
    return new Response(htmlPage({ variant: 'invalid' }), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // Récupère les infos du RDV pour affichage
  const { data: rdv } = await supabase
    .from('rendez_vous')
    .select('scheduled_at')
    .eq('id', row.rdv_id)
    .single()

  let rdvDateStr = ''
  let rdvTimeStr = ''
  if (rdv?.scheduled_at) {
    const d = new Date(rdv.scheduled_at)
    const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
    const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
    rdvDateStr = `${dayNames[d.getDay()]} ${d.getDate()} ${monthNames[d.getMonth()]}`
    rdvTimeStr = `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`
  }

  // Check expiration
  if (new Date(row.expires_at) < new Date()) {
    return new Response(htmlPage({ variant: 'expired' }), {
      status: 410,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // Already confirmed
  if (row.confirmed_at) {
    return new Response(htmlPage({ variant: 'already', rdv_date: rdvDateStr, rdv_time: rdvTimeStr }), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
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
    return new Response(htmlPage({ variant: 'invalid' }), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  return new Response(htmlPage({ variant: 'success', rdv_date: rdvDateStr, rdv_time: rdvTimeStr }), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
})
