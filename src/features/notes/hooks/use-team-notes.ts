import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { getTeamNotes, upsertTeamNote } from '../services/team-notes-service'

export function useTeamNotes() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['team-notes'],
    queryFn: getTeamNotes,
  })

  // Realtime : mise a jour instantanee quand un membre ecrit
  useEffect(() => {
    const channel = supabase
      .channel('team-notes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_notes' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['team-notes'] })
        },
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [queryClient])

  return query
}

export function useUpsertTeamNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ authorId, content }: { authorId: string; content: string }) =>
      upsertTeamNote(authorId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-notes'] })
    },
  })
}
