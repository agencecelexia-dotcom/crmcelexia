import { supabase } from '@/lib/supabase/client'

export interface ContractFile {
  id: string
  client_id: string
  uploaded_by: string
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  notes: string | null
  created_at: string
  deleted_at: string | null
}

export async function getContractsForClient(clientId: string): Promise<ContractFile[]> {
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as ContractFile[]
}

export async function uploadContract(params: {
  clientId: string
  uploadedBy: string
  file: File
  notes?: string | null
}): Promise<ContractFile> {
  const { clientId, uploadedBy, file, notes } = params

  // Upload file to Supabase Storage
  const filePath = `${clientId}/${Date.now()}_${file.name}`
  const { error: uploadError } = await supabase.storage
    .from('contrats')
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) throw uploadError

  // Insert record in contracts table
  const { data, error } = await supabase
    .from('contracts')
    .insert({
      client_id: clientId,
      uploaded_by: uploadedBy,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type || 'application/pdf',
      notes: notes ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as ContractFile
}

export async function softDeleteContract(id: string): Promise<void> {
  const { error } = await supabase
    .from('contracts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

export function getContractPublicUrl(filePath: string): string {
  const { data } = supabase.storage
    .from('contrats')
    .getPublicUrl(filePath)

  return data.publicUrl
}
