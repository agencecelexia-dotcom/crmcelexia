import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-smartlead-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * Edge Function : Smartlead webhook receiver.
 *
 * Smartlead envoie un POST à chaque event (email_sent, email_open, email_reply,
 * email_bounce, email_unsubscribe). On :
 *   1. Match le prospect en DB par email puis téléphone
 *   2. Met à jour custom_fields.smartlead_*
 *   3. Si event = reply → envoie un email HTML joli à agence.celexia@gmail.com via Resend
 *
 * Le filtre realtime côté CRM verra le UPDATE Supabase et notifiera le user.
 *
 * URL à configurer dans Smartlead :
 *   https://<project>.supabase.co/functions/v1/smartlead-webhook
 */

interface SmartleadEvent {
  event_type?: string  // 'EMAIL_SENT' | 'EMAIL_OPEN' | 'EMAIL_REPLY' | 'EMAIL_BOUNCE' | 'EMAIL_UNSUBSCRIBE'
  campaign_id?: number
  campaign_name?: string
  lead_id?: number
  email?: string
  phone?: string
  first_name?: string
  last_name?: string
  company_name?: string
  reply_message?: { text?: string; subject?: string }
  reply_text?: string
  sent_time?: string
  event_timestamp?: string
}

function normalizePhone(raw: string | undefined): string {
  if (!raw) return ''
  const d = raw.replace(/[^\d]/g, '')
  if (d.startsWith('33') && d.length === 11) return '0' + d.slice(2)
  if (d.length === 10 && d.startsWith('0')) return d
  if (d.length === 9) return '0' + d
  return d
}

function mapEventToStatus(eventType: string): string {
  const up = eventType.toUpperCase()
  if (up.includes('REPLY')) return 'replied'
  if (up.includes('OPEN')) return 'opened'
  if (up.includes('BOUNCE')) return 'bounced'
  if (up.includes('UNSUBSCRIBE')) return 'unsubscribed'
  return 'sent'
}

async function sendReplyEmailNotif(payload: SmartleadEvent, prospect: Record<string, unknown> | null) {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) {
    console.warn('No RESEND_API_KEY — skip email notif')
    return
  }
  const NOTIF_TO = Deno.env.get('SMARTLEAD_NOTIF_TO') ?? 'agence.celexia@gmail.com'
  const NOTIF_FROM = Deno.env.get('SMARTLEAD_NOTIF_FROM') ?? 'Thomas <thomas@celexia-pro.fr>'

  const fullName = [payload.first_name, payload.last_name].filter(Boolean).join(' ') || payload.company_name || 'Un prospect'
  const replyText = payload.reply_message?.text ?? payload.reply_text ?? '(réponse non transmise par Smartlead)'
  const replySubject = payload.reply_message?.subject ?? '(sans objet)'
  const prospectId = prospect?.id
  const ville = (prospect?.city as string) ?? ''
  const profession = (prospect?.profession as string) ?? ''
  const phone = (prospect?.phone as string) ?? payload.phone ?? ''

  const CRM_URL = Deno.env.get('CRM_BASE_URL') ?? 'https://crmcelexia.vercel.app'
  const fiche = prospectId ? `${CRM_URL}/prospects/${prospectId}` : `${CRM_URL}/prospects/inbox`

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;color:#0F172A">
  <div style="background:#7C3AED;color:white;padding:24px;border-radius:10px 10px 0 0">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.8">Smartlead</div>
    <div style="font-size:22px;font-weight:700;margin-top:4px">🔥 ${escapeHtml(fullName)} a répondu</div>
  </div>
  <div style="background:white;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px">
    <div style="background:#fafafa;border-left:4px solid #7C3AED;padding:14px 16px;border-radius:6px;margin-bottom:18px">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Sujet</div>
      <div style="font-weight:600;font-size:14px">${escapeHtml(replySubject)}</div>
    </div>
    <div style="background:#fefce8;border:1px solid #fde047;padding:16px;border-radius:8px;margin-bottom:20px;white-space:pre-wrap;font-size:14px;line-height:1.6">${escapeHtml(replyText)}</div>
    <table style="width:100%;font-size:13px;color:#475569;margin-bottom:24px">
      ${profession ? `<tr><td style="padding:4px 0">Métier</td><td style="padding:4px 0;color:#0F172A;font-weight:600">${escapeHtml(profession)}</td></tr>` : ''}
      ${ville ? `<tr><td style="padding:4px 0">Ville</td><td style="padding:4px 0;color:#0F172A;font-weight:600">${escapeHtml(ville)}</td></tr>` : ''}
      ${phone ? `<tr><td style="padding:4px 0">Téléphone</td><td style="padding:4px 0;color:#0F172A;font-weight:600"><a href="tel:${escapeAttr(phone)}" style="color:#0F172A">${escapeHtml(phone)}</a></td></tr>` : ''}
      ${payload.email ? `<tr><td style="padding:4px 0">Email</td><td style="padding:4px 0;color:#0F172A;font-weight:600">${escapeHtml(payload.email)}</td></tr>` : ''}
    </table>
    <div style="display:flex;gap:10px">
      <a href="${escapeAttr(fiche)}" style="display:inline-block;background:#0F172A;color:white;padding:12px 24px;border-radius:8px;font-weight:600;text-decoration:none;font-size:14px">Voir la fiche prospect</a>
      ${phone ? `<a href="tel:${escapeAttr(phone)}" style="display:inline-block;background:#16a34a;color:white;padding:12px 24px;border-radius:8px;font-weight:600;text-decoration:none;font-size:14px">📞 Appeler</a>` : ''}
    </div>
    <p style="font-size:12px;color:#94a3b8;margin-top:24px">Campagne : ${escapeHtml(payload.campaign_name ?? String(payload.campaign_id ?? '—'))}</p>
  </div>
</div>`

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: NOTIF_FROM,
        to: [NOTIF_TO],
        subject: `🔥 ${fullName} a répondu — ${ville || 'Smartlead'}`,
        html,
        reply_to: payload.email,
      }),
    })
    if (!r.ok) {
      console.error('Resend failed', r.status, await r.text())
    } else {
      console.log('Resend OK')
    }
  } catch (e) {
    console.error('Resend error', e)
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
function escapeAttr(s: string): string {
  return String(s).replace(/[<>"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  let payload: SmartleadEvent
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const eventType = payload.event_type ?? ''
  const status = mapEventToStatus(eventType)
  const sentAt = payload.sent_time ?? payload.event_timestamp ?? new Date().toISOString()
  console.log(`[smartlead-webhook] event=${eventType} email=${payload.email} status=${status}`)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Match prospect par email puis phone
  let prospect: Record<string, unknown> | null = null
  if (payload.email) {
    const { data } = await supabase
      .from('prospects')
      .select('id, custom_fields, city, profession, phone')
      .ilike('contact_email', payload.email)
      .is('deleted_at', null)
      .maybeSingle()
    if (data) prospect = data
  }
  if (!prospect && payload.phone) {
    const phoneNorm = normalizePhone(payload.phone)
    const { data } = await supabase
      .from('prospects')
      .select('id, custom_fields, city, profession, phone')
      .eq('phone', phoneNorm)
      .is('deleted_at', null)
      .maybeSingle()
    if (data) prospect = data
  }

  if (!prospect) {
    console.warn(`No prospect match for ${payload.email} / ${payload.phone}`)
    // On envoie quand même la notif si c'est un reply (par ex. ancien lead pas dans DB)
    if (status === 'replied') {
      await sendReplyEmailNotif(payload, null)
    }
    return new Response(JSON.stringify({ ok: true, matched: false }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Merge custom_fields
  const existing = (prospect.custom_fields as Record<string, unknown> | null) ?? {}
  const newCf: Record<string, unknown> = {
    ...existing,
    smartlead_campaign_id: payload.campaign_id,
    smartlead_status: status,
    smartlead_last_event: eventType,
  }
  if (status === 'sent' || !existing.smartlead_last_sent_at) {
    newCf.smartlead_last_sent_at = sentAt
  }
  if (status === 'opened') {
    newCf.smartlead_open_count = ((existing.smartlead_open_count as number) ?? 0) + 1
  }
  if (status === 'replied') {
    newCf.smartlead_reply_count = ((existing.smartlead_reply_count as number) ?? 0) + 1
    newCf.smartlead_last_reply_at = sentAt
    // Reset handled_at pour qu'il réapparaisse dans l'Inbox
    newCf.smartlead_handled_at = null
  }

  await supabase
    .from('prospects')
    .update({ custom_fields: newCf })
    .eq('id', prospect.id as string)

  // Envoie email notif uniquement sur reply
  if (status === 'replied') {
    await sendReplyEmailNotif(payload, prospect)
  }

  return new Response(JSON.stringify({ ok: true, prospect_id: prospect.id, status }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
