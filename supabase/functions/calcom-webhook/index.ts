import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cal-signature-256',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** HMAC-SHA256 signature verification for Cal.com webhooks */
async function verifySignature(body: string, signature: string | null): Promise<boolean> {
  const secret = Deno.env.get('CALCOM_WEBHOOK_SECRET')
  // If no secret configured, skip verification (but log warning)
  if (!secret) {
    console.warn('CALCOM_WEBHOOK_SECRET not set — skipping signature verification')
    return true
  }
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
      console.error('Invalid webhook signature')
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = JSON.parse(rawBody)
    const triggerEvent = body.triggerEvent
    const payload = body.payload

    if (!triggerEvent || !payload) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create Supabase admin client (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    if (triggerEvent === 'BOOKING_CREATED' || triggerEvent === 'BOOKING_RESCHEDULED') {
      const result = await handleBookingCreated(supabase, payload, triggerEvent)
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
  eventType: string,
) {
  // Extract cal.com booking data
  const startTime = payload.startTime as string
  const endTime = payload.endTime as string

  // Cal.com sends the video call URL in different places depending on version/config
  const metadata = payload.metadata as Record<string, unknown> | undefined
  const videoCallData = payload.videoCallData as { url?: string } | undefined
  const meetingUrl =
    videoCallData?.url
    || metadata?.videoCallUrl as string | undefined
    || payload.meetingUrl as string | undefined
    || (typeof payload.location === 'string' && payload.location.startsWith('http') ? payload.location : null)
    || null

  const location = payload.location as string | undefined || null
  const title = payload.title as string || 'RDV'
  const bookingId = String(payload.uid || payload.bookingId || '')
  const attendees = (payload.attendees as Array<{ email?: string; name?: string; phone?: string }>) || []
  const responses = payload.responses as Record<string, { value?: string }> | undefined
  const organizer = payload.organizer as { email?: string; name?: string } | undefined

  console.log('Webhook payload keys:', Object.keys(payload))
  console.log('Meeting URL resolved:', meetingUrl)
  console.log('Metadata:', JSON.stringify(metadata))

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

  // Try to find the prospect — prioritise metadata.prospect_id (set by CRM button)
  let prospectId: string | null = null

  if (metadata?.prospect_id) {
    // Validate UUID format to avoid injection
    const uuid = String(metadata.prospect_id)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
      prospectId = uuid
    }
  }

  // Fallback: match by attendee email or phone
  const attendeeEmail = attendees[0]?.email || null
  const attendeePhone = responses?.phone?.value || attendees[0]?.phone || null

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

  // Fix: use .eq() instead of .or() with string interpolation to prevent injection
  if (attendeePhone && !prospectId) {
    const normalized = attendeePhone.replace(/[^\d+]/g, '')
    const { data } = await supabase
      .from('prospects')
      .select('id')
      .is('deleted_at', null)
      .eq('phone', normalized)
      .limit(1)
      .maybeSingle()
    if (data) prospectId = data.id
  }

  if (!prospectId) {
    console.warn('No prospect matched for booking:', { attendeeEmail, attendeePhone, bookingId })
    return { ok: true, warning: 'No prospect matched', bookingId }
  }

  // Deduplicate: check if a RDV already exists for this booking ID
  if (bookingId) {
    const { data: existing } = await supabase
      .from('rendez_vous')
      .select('id')
      .like('notes', `[cal.com:${bookingId}]`)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (existing) {
      // Already exists — update it (handles both CREATED retries and RESCHEDULED)
      await supabase
        .from('rendez_vous')
        .update({
          scheduled_at: startTime,
          duration_minutes: durationMinutes,
          meeting_url: meetingUrl,
          location: rdvType === 'presentiel' ? location : null,
          type: rdvType,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      return { ok: true, action: 'updated', rdvId: existing.id }
    }
  }

  // Find the commercial (organizer) by email
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

  // Create the RDV
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
    console.error('RDV insert error:', insertErr)
    return { ok: false, error: insertErr.message }
  }

  // Update prospect status to rdv_pris
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
  const bookingId = String(payload.uid || payload.bookingId || '')
  if (!bookingId) return { ok: true, warning: 'No booking ID' }

  // Find RDV by cal.com booking ref in notes
  const { data: rdv } = await supabase
    .from('rendez_vous')
    .select('id')
    .like('notes', `[cal.com:${bookingId}]`)
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
