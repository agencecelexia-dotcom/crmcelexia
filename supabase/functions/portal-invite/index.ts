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
    const { client_id, email, full_name, password, contract_data } = await req.json()
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
    // Strong password: "celexia-" prefix (lisible pour le support) + 10 chars
    // random alphanumériques tirés d'un crypto.getRandomValues. Le set exclut
    // les caractères ambigus (0/O, 1/l/I) pour limiter les erreurs de lecture.
    // ~10^17 combinaisons — pas brute-forçable.
    function generateStrongPassword(): string {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
      const len = 10
      const bytes = new Uint8Array(len)
      crypto.getRandomValues(bytes)
      let out = ''
      for (let i = 0; i < len; i++) {
        out += alphabet[bytes[i] % alphabet.length]
      }
      return `celexia-${out}`
    }
    const tempPassword = password || generateStrongPassword()
    const displayName = full_name || [client.contact_firstname, client.contact_name].filter(Boolean).join(' ') || client.company_name

    // Récupération idempotente du user auth : si un essai précédent a créé
    // l'utilisateur mais a échoué à le lier au client (cf bug trigger
    // enforce_clients_artisan_invariants corrigé en migration 00103), on
    // réutilise le user existant au lieu de planter avec "email already
    // registered". On ne réutilise QUE si ce user n'est lié à AUCUN client
    // (sinon c'est légitimement bloqué côté UI via client.user_id check).
    let userId: string
    let tempPasswordForResponse = tempPassword

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
      // Cas "email déjà enregistré" : on cherche le user existant, on vérifie
      // qu'il n'est lié à aucun client, et on reset son password pour relancer
      // l'invitation proprement.
      const msg = (authError.message || '').toLowerCase()
      const isDuplicate = msg.includes('already') && (msg.includes('registered') || msg.includes('exists'))
      if (!isDuplicate) {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Liste paginée des users (admin API), match exact email
      // En pratique le user vient juste d'être créé, il est dans la 1ère page.
      const { data: list, error: listError } = await supabase.auth.admin.listUsers({
        page: 1, perPage: 1000,
      })
      if (listError) {
        return new Response(JSON.stringify({ error: listError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
      if (!existing) {
        return new Response(JSON.stringify({ error: 'Email enregistré mais user introuvable (incohérence Supabase Auth)' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Vérifie qu'aucun client n'utilise déjà ce user_id
      const { data: otherClient } = await supabase
        .from('clients')
        .select('id, company_name')
        .eq('user_id', existing.id)
        .maybeSingle()
      if (otherClient && otherClient.id !== client_id) {
        return new Response(JSON.stringify({
          error: `Cet email est déjà utilisé par un autre client (${otherClient.company_name}). Choisis un autre email.`,
        }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Reset password pour repartir d'un mdp connu (l'ancien était perdu)
      const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
        password: tempPassword,
        email_confirm: true,
        user_metadata: { role: 'artisan', full_name: displayName, client_id },
      })
      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      userId = existing.id
      tempPasswordForResponse = tempPassword
    } else {
      userId = authData.user.id
    }

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

    // Create onboarding record with contract_data
    await supabase
      .from('portal_onboardings')
      .insert({
        client_id,
        contract_data: contract_data || null,
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
        metadata: { invited_by: caller.id, temp_password: tempPasswordForResponse },
      })

    // Envoi de l'email d'invitation via la pipeline DB email_schedule → Resend.
    // Remplace l'ancien webhook n8n (fragile, fire-and-forget sans logs).
    await supabase.from('email_schedule').insert({
      recipient_email: email,
      recipient_name: displayName,
      email_type: 'portal_invitation',
      scheduled_at: new Date().toISOString(),
      status: 'scheduled',
      payload: {
        client_firstname: client.contact_firstname || displayName,
        client_company: client.company_name,
        portal_email: email,
        portal_password: tempPasswordForResponse,
        portal_url: 'https://crmcelexia.vercel.app/portal/auth',
      },
    })

    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      email,
      temp_password: tempPasswordForResponse,
      message: `Compte artisan créé pour ${displayName}. Mot de passe temporaire : ${tempPasswordForResponse}`,
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
