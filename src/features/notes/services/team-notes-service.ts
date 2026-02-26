import { supabase } from '@/lib/supabase/client'
import type { TeamNote } from '@/types'

const NOTE_SELECT = '*, author:profiles!team_notes_author_id_fkey(id, full_name)'

export async function getTeamNotes(): Promise<TeamNote[]> {
  const { data, error } = await supabase
    .from('team_notes')
    .select(NOTE_SELECT)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data as unknown as TeamNote[]
}

export async function upsertTeamNote(authorId: string, content: string): Promise<TeamNote> {
  const { data, error } = await supabase
    .from('team_notes')
    .upsert({ author_id: authorId, content }, { onConflict: 'author_id' })
    .select(NOTE_SELECT)
    .single()

  if (error) throw error
  return data as unknown as TeamNote
}
