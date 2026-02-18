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
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  let imported = 0
  let skipped = 0
  const errors: string[] = []

  // Insert in chunks of 100 (smaller chunks for better error isolation)
  const chunkSize = 100
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
      // Chunk failed — fallback to row-by-row insert
      for (let j = 0; j < chunk.length; j++) {
        const { error: rowError } = await supabase
          .from('prospects')
          .insert(chunk[j])
          .select('id')
          .single()

        if (rowError) {
          skipped++
          const rowIndex = i + j + 1
          const name = (chunk[j] as Record<string, string>)['company_name'] ?? `ligne ${rowIndex}`
          errors.push(`Ligne ${rowIndex} (${name}) : ${rowError.message}`)
        } else {
          imported++
        }
      }
    } else {
      imported += data?.length ?? 0
    }
  }

  // Update import record
  const finalStatus = imported === 0 && rows.length > 0 ? 'failed' : 'completed'
  await supabase
    .from('csv_imports')
    .update({
      status: finalStatus,
      imported_count: imported,
      skipped_count: skipped,
      error_log: errors.length > 0 ? errors.map((e) => ({ message: e })) : null,
    })
    .eq('id', importId)

  return { imported, skipped, errors }
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
