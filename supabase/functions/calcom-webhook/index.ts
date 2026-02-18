import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cal-signature-256',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** HMAC-SHA256 signature verification for Cal.com webhooks */
async function verifySignature(body: string, signature: string | null): Promise<boolean> {
  const secret = Deno.env.get('CALCOM_WEBHOOK_SECRET')
  // If no secret configured, skip verification
  if (!secret) return true
  if (!signature) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const expected = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return signature === expected
}

/**
 * Normalize a phone number to digits-only with +33 prefix for French numbers.
 * Handles: "06 12 34 56 78", "+33 6 12 34 56 78", "0612345678", "+33612345678"
 */
function normalizePhone(phone: string): string[] {
  const stripped = phone.replace(/[\s.\-()]/g, '')
  const digitsOnly = stripped.replace(/[^\d+]/g, '')

  const variants: string[] = [digitsOnly]

  // French number: convert 0X → +33X and vice versa
  if (digitsOnly.startsWith('+33')) {
    variants.push('0' + digitsOnly.slice(3))
    variants.push(digitsOnly.slice(1)) // without +
  } else if (digitsOnly.startsWith('33') && digitsOnly.length === 11) {
    variants.push('+' + digitsOnly)
    variants.push('0' + digitsOnly.slice(2))
  } else if (digitsOnly.startsWith('0') && digitsOnly.length === 10) {
    variants.push('+33' + digitsOnly.slice(1))
    variants.push('33' + digitsOnly.slice(1))
  }

  return [...new Set(variants)]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const rawBody = await req.text()

    // Verify webhook signature
    const signature = req.headers.get('x-cal-signature-256')
    const isValid = await verifySignature(rawBody, signature)
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = JSON.parse(rawBody)

    // Cal.com v1: { triggerEvent, payload }
    // Cal.com v2: event data might be at root level
    const triggerEvent = body.triggerEvent || body.event || body.type
    const payload = body.payload || body

    if (!triggerEvent) {
      return new Response(JSON.stringify({ error: 'No trigger event' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create Supabase admin client (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    if (triggerEvent === 'BOOKING_CREATED' || triggerEvent === 'BOOKING_RESCHEDULED') {
      const result = await handleBookingCreated(supabase, payload)
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (triggerEvent === 'BOOKING_CANCELLED') {
      const result = await handleBookingCancelled(supabase, payload)
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Unknown event — acknowledge but ignore
    return new Response(JSON.stringify({ ok: true, ignored: triggerEvent }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function handleBookingCreated(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  // Extract cal.com booking data
  const startTime = payload.startTime as string
  const endTime = payload.endTime as string

  // Cal.com sends metadata in different places depending on version/config
  const payloadMetadata = payload.metadata as Record<string, unknown> | undefined
  const responsesMetadata = (payload.responses as Record<string, unknown>)?.metadata as Record<string, unknown> | undefined
  const metadata = payloadMetadata || responsesMetadata || {}

  // Cal.com sends the video call URL in different places
  const videoCallData = payload.videoCallData as { url?: string } | undefined
  const meetingUrl =
    videoCallData?.url
    || (metadata.videoCallUrl as string | undefined)
    || (payload.meetingUrl as string | undefined)
    || (typeof payload.location === 'string' && payload.location.startsWith('http') ? payload.location : null)
    || null

  const location = payload.location as string | undefined || null
  const title = payload.title as string || 'RDV'
  const bookingId = String(payload.uid || payload.bookingId || payload.id || '')
  const attendees = (payload.attendees as Array<{ email?: string; name?: string; phone?: string }>) || []
  const responses = payload.responses as Record<string, { value?: string }> | undefined
  const organizer = payload.organizer as { email?: string; name?: string } | undefined

  // Compute duration
  let durationMinutes = 30
  if (startTime && endTime) {
    durationMinutes = Math.round(
      (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60_000,
    )
  }

  // Determine RDV type from location
  let rdvType: 'telephone' | 'visio' | 'presentiel' = 'visio'
  if (location) {
    const loc = location.toLowerCase()
    if (loc.includes('phone') || loc.includes('tel') || loc.includes('appel') || loc.includes('téléphone')) {
      rdvType = 'telephone'
    } else if (loc.includes('address') || loc.includes('bureau') || loc.includes('agence') || loc.includes('présentiel')) {
      rdvType = 'presentiel'
    }
  }
  if (meetingUrl) rdvType = 'visio'

  // --- Try to find the prospect ---

  let prospectId: string | null = null

  // 1. metadata.prospect_id (set by CRM button in the Cal.com URL)
  const metaProspectId = metadata.prospect_id as string | undefined
  if (metaProspectId) {
    const uuid = String(metaProspectId)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
      // Verify the prospect actually exists
      const { data } = await supabase
        .from('prospects')
        .select('id')
        .eq('id', uuid)
        .is('deleted_at', null)
        .maybeSingle()
      if (data) prospectId = data.id
    }
  }

  // 2. Match by attendee email
  const attendeeEmail = attendees[0]?.email || null
  if (attendeeEmail && !prospectId) {
    const { data } = await supabase
      .from('prospects')
      .select('id')
      .eq('contact_email', attendeeEmail)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    if (data) prospectId = data.id
  }

  // 3. Match by phone (with French number normalization)
  const attendeePhone = responses?.phone?.value || attendees[0]?.phone || (metadata.phone as string | undefined) || null
  if (attendeePhone && !prospectId) {
    const phoneVariants = normalizePhone(attendeePhone)
    for (const variant of phoneVariants) {
      if (prospectId) break
      const { data } = await supabase
        .from('prospects')
        .select('id')
        .is('deleted_at', null)
        .eq('phone', variant)
        .limit(1)
        .maybeSingle()
      if (data) prospectId = data.id
    }
  }

  if (!prospectId) {
    return { ok: true, warning: 'No prospect matched', bookingId, attendeeEmail, attendeePhone: attendeePhone?.slice(0, 6) }
  }

  // --- Deduplicate: check if a RDV already exists for this booking ID ---
  if (bookingId) {
    const { data: existing } = await supabase
      .from('rendez_vous')
      .select('id')
      .like('notes', `%[cal.com:${bookingId}]%`)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (existing) {
      // Already exists — update it (handles RESCHEDULED and retries)
      await supabase
        .from('rendez_vous')
        .update({
          scheduled_at: startTime,
          duration_minutes: durationMinutes,
          meeting_url: meetingUrl,
          location: rdvType === 'presentiel' ? location : null,
          type: rdvType,
          notes: `[cal.com:${bookingId}]`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      return { ok: true, action: 'updated', rdvId: existing.id }
    }
  }

  // --- Find the commercial (organizer) by email ---
  let commercialId: string | null = null
  if (organizer?.email) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', organizer.email)
      .limit(1)
      .maybeSingle()
    if (data) commercialId = data.id
  }

  // Fallback: pick the prospect's commercial_id or first founder
  if (!commercialId) {
    const { data: prospect } = await supabase
      .from('prospects')
      .select('commercial_id')
      .eq('id', prospectId)
      .single()
    if (prospect?.commercial_id) {
      commercialId = prospect.commercial_id
    } else {
      const { data: founder } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'fondateur')
        .limit(1)
        .maybeSingle()
      if (founder) commercialId = founder.id
    }
  }

  if (!commercialId) {
    return { ok: false, error: 'No commercial found' }
  }

  // --- Create the RDV ---
  const notes = bookingId ? `[cal.com:${bookingId}]` : `[cal.com] ${title}`
  const { data: rdv, error: insertErr } = await supabase
    .from('rendez_vous')
    .insert({
      prospect_id: prospectId,
      commercial_id: commercialId,
      scheduled_at: startTime,
      duration_minutes: durationMinutes,
      type: rdvType,
      status: 'prevu',
      meeting_url: meetingUrl,
      location: rdvType === 'presentiel' ? location : null,
      notes,
    })
    .select('id')
    .single()

  if (insertErr) {
    return { ok: false, error: insertErr.message }
  }

  // Update prospect status to rdv_pris (only if not already in a later stage)
  await supabase
    .from('prospects')
    .update({ status: 'rdv_pris', updated_at: new Date().toISOString() })
    .eq('id', prospectId)
    .in('status', ['nouveau', 'appele_sans_reponse', 'messagerie', 'interesse', 'a_rappeler'])

  return { ok: true, action: 'created', rdvId: rdv.id, prospectId }
}

async function handleBookingCancelled(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  const bookingId = String(payload.uid || payload.bookingId || payload.id || '')
  if (!bookingId) return { ok: true, warning: 'No booking ID' }

  // Find RDV by cal.com booking ref in notes
  const { data: rdv } = await supabase
    .from('rendez_vous')
    .select('id')
    .like('notes', `%[cal.com:${bookingId}]%`)
    .eq('status', 'prevu')
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (!rdv) {
    return { ok: true, warning: 'No matching RDV found' }
  }

  await supabase
    .from('rendez_vous')
    .update({
      status: 'annule',
      updated_at: new Date().toISOString(),
    })
    .eq('id', rdv.id)

  return { ok: true, action: 'cancelled', rdvId: rdv.id }
}
