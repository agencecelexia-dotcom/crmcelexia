import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Verify the caller is a founder (via their JWT)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const callerToken = authHeader.replace('Bearer ', '')
    const { data: { user: caller } } = await supabase.auth.getUser(callerToken)
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check caller is founder
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (!callerProfile || !['fondateur', 'co_fondateur'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Founders only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse request body
    const { client_id, email, full_name, password } = await req.json()
    if (!client_id || !email) {
      return new Response(JSON.stringify({ error: 'client_id and email required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify client exists
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, company_name, contact_firstname, contact_name, user_id')
      .eq('id', client_id)
      .single()

    if (clientError || !client) {
      return new Response(JSON.stringify({ error: 'Client not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if already has a user
    if (client.user_id) {
      return new Response(JSON.stringify({ error: 'Client already has a portal account' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create the auth user with artisan role
    const tempPassword = password || crypto.randomUUID().slice(0, 12)
    const displayName = full_name || [client.contact_firstname, client.contact_name].filter(Boolean).join(' ') || client.company_name

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // auto-confirm so they can log in immediately
      user_metadata: {
        role: 'artisan',
        full_name: displayName,
        client_id,
      },
    })

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = authData.user.id

    // Create profile manually (trigger may fail silently)
    await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email,
        full_name: displayName,
        role: 'artisan',
      }, { onConflict: 'id' })

    // Link user to client
    await supabase
      .from('clients')
      .update({
        user_id: userId,
        portal_enabled: true,
        portal_activated_at: new Date().toISOString(),
        contact_email: email, // ensure email is up to date
      })
      .eq('id', client_id)

    // Create onboarding record
    await supabase
      .from('portal_onboardings')
      .insert({
        client_id,
      })

    // Log the invitation
    await supabase
      .from('email_logs')
      .insert({
        type: 'portal_invitation',
        recipient_email: email,
        client_id,
        subject: `Invitation portail Celexia - ${client.company_name}`,
        status: 'sent',
        metadata: { invited_by: caller.id, temp_password: tempPassword },
      })

    // Send invitation email via N8N webhook (fire-and-forget)
    try {
      await fetch('https://n8n.srv1241880.hstgr.cloud/webhook/portal-invitation-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          temp_password: tempPassword,
          artisan_firstname: client.contact_firstname || displayName,
          company_name: client.company_name,
          portal_url: 'https://crmcelexia.vercel.app/portal/auth',
        }),
      })
    } catch { /* email send failure shouldn't block invite */ }

    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      email,
      temp_password: tempPassword,
      message: `Compte artisan créé pour ${displayName}. Mot de passe temporaire : ${tempPassword}`,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[portal-invite]', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
