import { supabase } from '@/lib/supabase/client'
import type { CsvImport, CsvMappingPreset } from '@/types'

export async function createImportRecord(params: {
  uploaded_by: string
  original_filename: string
  row_count: number
  column_mapping: Record<string, string>
  assigned_commercial_id?: string
}): Promise<CsvImport> {
  const { data, error } = await supabase
    .from('csv_imports')
    .insert({
      ...params,
      status: 'processing',
    })
    .select()
    .single()

  if (error) throw error
  return data as CsvImport
}

export async function importProspects(
  importId: string,
  rows: Record<string, string>[],
  commercialId: string,
): Promise<{ imported: number; skipped: number }> {
  let imported = 0
  let skipped = 0

  // Insert in chunks of 500
  const chunkSize = 500
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((row) => ({
      ...row,
      commercial_id: commercialId,
      import_id: importId,
      source: 'csv_import' as const,
      status: 'nouveau' as const,
    }))

    const { data, error } = await supabase
      .from('prospects')
      .insert(chunk)
      .select('id')

    if (error) {
      console.error('Import chunk error:', error)
      skipped += chunk.length
    } else {
      imported += data?.length ?? 0
    }
  }

  // Update import record
  await supabase
    .from('csv_imports')
    .update({
      status: 'completed',
      imported_count: imported,
      skipped_count: skipped,
    })
    .eq('id', importId)

  return { imported, skipped }
}

export async function getMappingPresets(): Promise<CsvMappingPreset[]> {
  const { data, error } = await supabase
    .from('csv_mapping_presets')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as CsvMappingPreset[]
}

export async function saveMappingPreset(params: {
  name: string
  mapping: Record<string, string>
  created_by: string
}): Promise<CsvMappingPreset> {
  const { data, error } = await supabase
    .from('csv_mapping_presets')
    .insert(params)
    .select()
    .single()

  if (error) throw error
  return data as CsvMappingPreset
}
