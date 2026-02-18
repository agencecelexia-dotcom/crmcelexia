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

/** Log a webhook event to the database */
async function logWebhookEvent(
  supabase: ReturnType<typeof createClient>,
  params: {
    event_type: string
    trigger_id?: string
    prospect_id?: string | null
    rdv_id?: string | null
    status: string
    error_message?: string | null
    payload?: Record<string, unknown>
  },
) {
  try {
    await supabase.from('webhook_events').insert({
      webhook_type: 'calcom',
      event_type: params.event_type,
      trigger_id: params.trigger_id ?? null,
      prospect_id: params.prospect_id ?? null,
      rdv_id: params.rdv_id ?? null,
      status: params.status,
      error_message: params.error_message ?? null,
      payload: params.payload ?? null,
    })
  } catch (err) {
    console.error('Failed to log webhook event:', err)
  }
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

    console.log(`[calcom-webhook] Processing event: ${triggerEvent}`)

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
    return new Response(JSON.stringify({ error: 'Internal error', details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function handleBookingCreated(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  triggerEvent: string,
) {
  // Extract cal.com booking data
  const startTime = payload.startTime as string
  const endTime = payload.endTime as string
  const bookingId = String(payload.uid || payload.bookingId || payload.id || '')

  console.log(`[calcom-webhook] Booking ID: ${bookingId}, start: ${startTime}`)

  // ── Extract metadata from ALL possible locations ──
  // Cal.com sends metadata differently depending on version, config, and booking type:
  // 1. payload.metadata (most common in v1)
  // 2. payload.responses.metadata (some v2 configs)
  // 3. payload.metadata.prospect_id directly
  // 4. payload.responses (custom questions can contain metadata)
  // 5. payload.bookingFields (newer Cal.com API)

  const payloadMetadata = payload.metadata as Record<string, unknown> | undefined
  const responsesObj = payload.responses as Record<string, unknown> | undefined
  const responsesMetadata = responsesObj?.metadata as Record<string, unknown> | undefined
  const bookingFields = payload.bookingFields as Record<string, unknown> | undefined
  const bookingFieldsMetadata = bookingFields?.metadata as Record<string, unknown> | undefined

  // Merge all possible metadata sources
  const metadata: Record<string, unknown> = {
    ...bookingFieldsMetadata,
    ...responsesMetadata,
    ...payloadMetadata,
  }

  // Also check for prospect_id at various nesting levels
  if (!metadata.prospect_id) {
    // Check in responses directly (Cal.com custom fields)
    if (responsesObj?.prospect_id) {
      const val = responsesObj.prospect_id
      metadata.prospect_id = typeof val === 'object' && val !== null && 'value' in (val as Record<string, unknown>)
        ? (val as Record<string, unknown>).value
        : val
    }
    // Check in bookingFields directly
    if (!metadata.prospect_id && bookingFields?.prospect_id) {
      metadata.prospect_id = bookingFields.prospect_id
    }
  }

  console.log(`[calcom-webhook] Metadata extracted:`, JSON.stringify(metadata))

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
  let matchMethod = 'none'

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
      if (data) {
        prospectId = data.id
        matchMethod = 'metadata_prospect_id'
      }
    }
    console.log(`[calcom-webhook] Match by metadata.prospect_id (${uuid}): ${prospectId ? 'FOUND' : 'NOT FOUND'}`)
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
    if (data) {
      prospectId = data.id
      matchMethod = 'email'
    }
    console.log(`[calcom-webhook] Match by email (${attendeeEmail}): ${prospectId ? 'FOUND' : 'NOT FOUND'}`)
  }

  // 3. Match by phone (with French number normalization)
  const attendeePhone = responses?.phone?.value || attendees[0]?.phone || (metadata.phone as string | undefined) || null
  if (attendeePhone && !prospectId) {
    const phoneVariants = normalizePhone(attendeePhone)
    console.log(`[calcom-webhook] Trying phone variants:`, phoneVariants)
    for (const variant of phoneVariants) {
      if (prospectId) break
      // Try main phone
      const { data } = await supabase
        .from('prospects')
        .select('id')
        .is('deleted_at', null)
        .eq('phone', variant)
        .limit(1)
        .maybeSingle()
      if (data) {
        prospectId = data.id
        matchMethod = 'phone'
      }
      // Also try secondary phone
      if (!prospectId) {
        const { data: data2 } = await supabase
          .from('prospects')
          .select('id')
          .is('deleted_at', null)
          .eq('phone_secondary', variant)
          .limit(1)
          .maybeSingle()
        if (data2) {
          prospectId = data2.id
          matchMethod = 'phone_secondary'
        }
      }
    }
    console.log(`[calcom-webhook] Match by phone: ${prospectId ? 'FOUND via ' + matchMethod : 'NOT FOUND'}`)
  }

  // 4. Last resort: match by attendee name against company_name
  const attendeeName = attendees[0]?.name || null
  if (attendeeName && !prospectId) {
    const { data } = await supabase
      .from('prospects')
      .select('id')
      .is('deleted_at', null)
      .ilike('company_name', attendeeName)
      .limit(1)
      .maybeSingle()
    if (data) {
      prospectId = data.id
      matchMethod = 'company_name'
    }
    console.log(`[calcom-webhook] Match by name (${attendeeName}): ${prospectId ? 'FOUND' : 'NOT FOUND'}`)
  }

  if (!prospectId) {
    const warning = `No prospect matched. Email: ${attendeeEmail}, Phone: ${attendeePhone?.slice(0, 6)}***, MetadataId: ${metaProspectId}`
    console.warn(`[calcom-webhook] ${warning}`)

    await logWebhookEvent(supabase, {
      event_type: triggerEvent,
      trigger_id: bookingId,
      status: 'failed',
      error_message: warning,
      payload: {
        attendeeEmail,
        attendeePhone: attendeePhone?.slice(0, 6),
        metaProspectId,
        matchMethod,
      },
    })

    return { ok: false, warning, bookingId }
  }

  console.log(`[calcom-webhook] Prospect matched: ${prospectId} via ${matchMethod}`)

  // --- Deduplicate: check if a RDV already exists for this booking ---
  if (bookingId) {
    // First try by external_booking_id (new reliable method)
    const { data: existingById } = await supabase
      .from('rendez_vous')
      .select('id')
      .eq('external_booking_id', bookingId)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    // Fallback: check by notes pattern (backward compatibility)
    const existing = existingById || (await (async () => {
      const { data } = await supabase
        .from('rendez_vous')
        .select('id')
        .like('notes', `%[cal.com:${bookingId}]%`)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()
      return data
    })())

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
          external_booking_id: bookingId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      await logWebhookEvent(supabase, {
        event_type: triggerEvent,
        trigger_id: bookingId,
        prospect_id: prospectId,
        rdv_id: existing.id,
        status: 'success',
        payload: { action: 'updated', matchMethod },
      })

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
    const error = 'No commercial found for this booking'
    console.error(`[calcom-webhook] ${error}`)

    await logWebhookEvent(supabase, {
      event_type: triggerEvent,
      trigger_id: bookingId,
      prospect_id: prospectId,
      status: 'failed',
      error_message: error,
    })

    return { ok: false, error }
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
      external_booking_id: bookingId || null,
    })
    .select('id')
    .single()

  if (insertErr) {
    console.error(`[calcom-webhook] Insert error:`, insertErr)

    await logWebhookEvent(supabase, {
      event_type: triggerEvent,
      trigger_id: bookingId,
      prospect_id: prospectId,
      status: 'failed',
      error_message: insertErr.message,
    })

    return { ok: false, error: insertErr.message }
  }

  // Update prospect status to rdv_pris (only if not already in a later stage)
  await supabase
    .from('prospects')
    .update({ status: 'rdv_pris', updated_at: new Date().toISOString() })
    .eq('id', prospectId)
    .in('status', ['nouveau', 'appele_sans_reponse', 'messagerie', 'interesse', 'a_rappeler', 'negatif'])

  console.log(`[calcom-webhook] RDV created: ${rdv.id} for prospect: ${prospectId}`)

  await logWebhookEvent(supabase, {
    event_type: triggerEvent,
    trigger_id: bookingId,
    prospect_id: prospectId,
    rdv_id: rdv.id,
    status: 'success',
    payload: {
      action: 'created',
      matchMethod,
      rdvType,
      meetingUrl: meetingUrl ? 'present' : 'absent',
      durationMinutes,
    },
  })

  return { ok: true, action: 'created', rdvId: rdv.id, prospectId }
}

async function handleBookingCancelled(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  const bookingId = String(payload.uid || payload.bookingId || payload.id || '')
  if (!bookingId) return { ok: true, warning: 'No booking ID' }

  // Find RDV by external_booking_id first, then fallback to notes pattern
  let rdv: { id: string } | null = null

  const { data: byId } = await supabase
    .from('rendez_vous')
    .select('id')
    .eq('external_booking_id', bookingId)
    .eq('status', 'prevu')
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  rdv = byId

  if (!rdv) {
    const { data: byNotes } = await supabase
      .from('rendez_vous')
      .select('id')
      .like('notes', `%[cal.com:${bookingId}]%`)
      .eq('status', 'prevu')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    rdv = byNotes
  }

  if (!rdv) {
    await logWebhookEvent(supabase, {
      event_type: 'BOOKING_CANCELLED',
      trigger_id: bookingId,
      status: 'warning',
      error_message: 'No matching RDV found for cancellation',
    })
    return { ok: true, warning: 'No matching RDV found' }
  }

  await supabase
    .from('rendez_vous')
    .update({
      status: 'annule',
      updated_at: new Date().toISOString(),
    })
    .eq('id', rdv.id)

  await logWebhookEvent(supabase, {
    event_type: 'BOOKING_CANCELLED',
    trigger_id: bookingId,
    rdv_id: rdv.id,
    status: 'success',
    payload: { action: 'cancelled' },
  })

  return { ok: true, action: 'cancelled', rdvId: rdv.id }
}
