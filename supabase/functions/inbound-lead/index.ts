// ════════════════════════════════════════════════════════════════════
// Edge Function : inbound-lead
// ════════════════════════════════════════════════════════════════════
//
// Endpoint public pour ingérer les demandes de devis venant des sites
// vitrines des artisans Celexia. Chaque site possède une clé API
// (X-API-Key) qui identifie l'artisan destinataire.
//
// Pattern :
//   POST /functions/v1/inbound-lead
//   Headers:
//     Content-Type: application/json
//     X-API-Key: cxa_live_<random>
//   Body JSON: { name, phone, email, work_type, city, message }
//
// Réponses :
//   201 { ok: true, lead_id }
//   400 { error: 'validation_failed', details }
//   401 { error: 'invalid_api_key' }
//   500 { error: 'internal_error' }
//
// ⚠️ La clé doit IMPÉRATIVEMENT rester côté serveur du site (route API
// Next.js, Vercel function, etc.). Si elle est dans le bundle browser,
// elle est volable. Bonus de sécurité : restreindre CORS au domaine
// du site vitrine via la variable env ALLOWED_ORIGIN (sinon `*`).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS : par défaut on accepte tous les origins (le site peut être en
// dev sur localhost, en preview, en prod). Pour serrer plus tard, set
// ALLOWED_ORIGIN dans les secrets de la function.
const ALLOWED_ORIGIN = Deno.env.get('INBOUND_LEAD_ALLOWED_ORIGIN') || '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'content-type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

interface InboundPayload {
  name?: string
  phone?: string
  email?: string
  work_type?: string
  city?: string
  message?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' })
  }

  try {
    // 1. Authentification via X-API-Key
    const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key')
    if (!apiKey || !apiKey.startsWith('cxa_')) {
      return jsonResponse(401, { error: 'invalid_api_key' })
    }
    const keyHash = await sha256Hex(apiKey)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: keyRow, error: keyErr } = await supabase
      .from('client_api_keys')
      .select('id, client_id, revoked_at')
      .eq('key_hash', keyHash)
      .maybeSingle()

    if (keyErr || !keyRow || keyRow.revoked_at) {
      return jsonResponse(401, { error: 'invalid_api_key' })
    }

    // 2. Parse + validation payload
    let body: InboundPayload
    try {
      body = await req.json()
    } catch {
      return jsonResponse(400, { error: 'validation_failed', details: 'Invalid JSON body' })
    }

    const name = (body.name || '').toString().trim()
    const phone = (body.phone || '').toString().trim()
    const email = (body.email || '').toString().trim()
    const workType = (body.work_type || '').toString().trim()
    const city = (body.city || '').toString().trim()
    const message = (body.message || '').toString().trim()

    // Au moins un canal de contact obligatoire
    if (!phone && !email) {
      return jsonResponse(400, {
        error: 'validation_failed',
        details: 'phone or email is required',
      })
    }
    if (name.length > 200 || workType.length > 200 || city.length > 200) {
      return jsonResponse(400, { error: 'validation_failed', details: 'field too long' })
    }
    if (message.length > 5000) {
      return jsonResponse(400, {
        error: 'validation_failed',
        details: 'message exceeds 5000 chars',
      })
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse(400, { error: 'validation_failed', details: 'invalid email' })
    }

    // 3. Construit le lead. `name` et `phone` sont NOT NULL en DB →
    // on remplit avec des fallbacks lisibles côté artisan si absents.
    const displayName = name || (email ? email.split('@')[0] : `Lead site web`)
    const displayPhone = phone || '—'
    const noteParts: string[] = []
    if (message) noteParts.push(`Message du visiteur :\n${message}`)
    if (email && phone) noteParts.push(`Email : ${email}`)

    const { data: lead, error: insertErr } = await supabase
      .from('portal_leads')
      .insert({
        client_id: keyRow.client_id,
        name: displayName,
        phone: displayPhone,
        email: email || null,
        city: city || null,
        work_type: workType || 'Demande site web',
        source: 'site_web',
        status: 'nouveau',
        notes: noteParts.join('\n\n'),
      })
      .select('id')
      .single()

    if (insertErr || !lead) {
      console.error('inbound-lead insert error', insertErr)
      return jsonResponse(500, { error: 'internal_error' })
    }

    // 4. Update tracking (atomique via RPC). Non bloquant : si ça
    //    rate, le lead est déjà créé, c'est juste la stat qui rate.
    supabase.rpc('increment_api_key_use', { p_key_id: keyRow.id })
      .then(() => undefined, (err) => console.warn('use_count update failed', err))

    return jsonResponse(201, { ok: true, lead_id: lead.id })
  } catch (e) {
    console.error('inbound-lead unexpected error', e)
    return jsonResponse(500, { error: 'internal_error' })
  }
})
