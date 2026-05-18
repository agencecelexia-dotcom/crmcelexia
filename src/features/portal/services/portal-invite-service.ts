import { supabase } from '@/lib/supabase/client'
import type { ContractData } from '@/features/contracts/services/contract-generator'

interface InviteResult {
  success: boolean
  user_id: string
  email: string
  temp_password: string
  message: string
  recovered_existing?: boolean
}

export async function inviteArtisanToPortal(
  clientId: string,
  email: string,
  fullName?: string,
  contractData?: ContractData,
): Promise<InviteResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-invite`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        client_id: clientId,
        email,
        full_name: fullName,
        contract_data: contractData,
      }),
    },
  )

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Invitation failed')
  return data as InviteResult
}
