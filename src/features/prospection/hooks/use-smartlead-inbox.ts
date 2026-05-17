import { useEffect } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { Prospect } from '@/types'
import type { RealtimePostgresUpdatePayload } from '@supabase/supabase-js'

/**
 * Liste les prospects ayant répondu via Smartlead et pas encore traités.
 * Triés par date de réponse DESC (les plus récents en haut).
 * Subscribe au realtime pour rafraîchir automatiquement à chaque update.
 */
export function useSmartleadInbox() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['smartlead-inbox'],
    queryFn: async (): Promise<Prospect[]> => {
      // On filtre côté Postgres via JSONB
      const { data, error } = await supabase
        .from('prospects')
        .select('*')
        .is('deleted_at', null)
        .filter('custom_fields->>smartlead_status', 'eq', 'replied')
        .filter('custom_fields->>smartlead_handled_at', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as Prospect[]
    },
    staleTime: 10_000,
  })

  // Realtime : tout update de prospects qui touche smartlead → refetch
  useEffect(() => {
    const channel = supabase
      .channel('smartlead-inbox-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'prospects' },
        (payload: RealtimePostgresUpdatePayload<Record<string, unknown>>) => {
          // On refetch si custom_fields a changé
          const oldCf = (payload.old as { custom_fields?: Record<string, unknown> })?.custom_fields ?? {}
          const newCf = (payload.new as { custom_fields?: Record<string, unknown> })?.custom_fields ?? {}
          if (oldCf.smartlead_status !== newCf.smartlead_status ||
              oldCf.smartlead_handled_at !== newCf.smartlead_handled_at) {
            queryClient.invalidateQueries({ queryKey: ['smartlead-inbox'] })
            // Si c'est devenu 'replied' (nouvelle réponse) → notification browser
            if (newCf.smartlead_status === 'replied' && oldCf.smartlead_status !== 'replied') {
              if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                const newRow = payload.new as { company_name?: string; contact_firstname?: string; contact_name?: string }
                const name = [newRow.contact_firstname, newRow.contact_name].filter(Boolean).join(' ') || newRow.company_name || 'Un prospect'
                new Notification('🔥 Nouvelle réponse Smartlead', {
                  body: `${name} a répondu à votre cold email.`,
                  icon: '/favicon.ico',
                  tag: 'smartlead-reply',
                })
              }
            }
          }
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  return query
}

export function useMarkReplyHandled() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (prospectId: string) => {
      // Récupère le prospect pour merger custom_fields
      const { data: current, error: fetchErr } = await supabase
        .from('prospects').select('custom_fields').eq('id', prospectId).single()
      if (fetchErr) throw fetchErr
      const newCf = { ...(current?.custom_fields ?? {}), smartlead_handled_at: new Date().toISOString() }
      const { error } = await supabase
        .from('prospects').update({ custom_fields: newCf }).eq('id', prospectId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smartlead-inbox'] })
      queryClient.invalidateQueries({ queryKey: ['prospect'] })
    },
  })
}

/** Demande la permission de notification browser au montage de la page Inbox. */
export function useRequestNotificationPermission() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])
}
