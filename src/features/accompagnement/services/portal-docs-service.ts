import { supabase } from '@/lib/supabase/client'

/** Sous-ensemble de portal_onboardings : juste les paths et timestamps utiles
 *  pour afficher les documents dans le dialog Accompagnement. */
export interface PortalDocsRow {
  signed_contract_path: string | null
  contract_signed_at: string | null
  payment_proof_path: string | null
  rc_pro_path: string | null
  kbis_path: string | null
  gmb_access_confirmed: boolean
  gmb_confirmed_at: string | null
}

export async function getPortalDocsForClient(clientId: string): Promise<PortalDocsRow | null> {
  const { data, error } = await supabase
    .from('portal_onboardings')
    .select(
      'signed_contract_path, contract_signed_at, payment_proof_path, rc_pro_path, kbis_path, gmb_access_confirmed, gmb_confirmed_at',
    )
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as PortalDocsRow | null
}

/** Génère une signed URL Supabase Storage (1 h) pour un fichier du bucket portal-documents. */
export async function getPortalDocSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('portal-documents')
    .createSignedUrl(path, 3600)
  if (error) throw error
  if (!data?.signedUrl) throw new Error('URL signée introuvable')
  return data.signedUrl
}
