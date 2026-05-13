import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

/**
 * Subscription Supabase Realtime sur `portal_leads` côté ADMIN.
 *
 * - `clientId` fourni → filtre les events sur ce client (fiche
 *   `/clients/{id}`, carte Accompagnement + tableau Finances).
 * - `clientId` undefined → écoute tous les events (dashboard founder
 *   `/dashboard`, agrège cross-clients).
 *
 * Invalide automatiquement toutes les queries admin qui agrègent
 * portal_leads pour que le fondateur voit les déclarations de
 * paiement / signatures en temps réel sans avoir à F5.
 */
export function useAdminPortalLeadsRealtime(clientId?: string): void {
  const qc = useQueryClient()
  useEffect(() => {
    const channelKey = clientId ? `admin-portal-leads-${clientId}` : 'admin-portal-leads-all'
    const channel = supabase
      .channel(channelKey)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'portal_leads',
          ...(clientId ? { filter: `client_id=eq.${clientId}` } : {}),
        },
        () => {
          qc.invalidateQueries({ queryKey: ['admin-commissions-pending'] })
          qc.invalidateQueries({ queryKey: ['admin', 'commission-stats'] })
          qc.invalidateQueries({ queryKey: ['accompagnement', 'kpis'] })
          qc.invalidateQueries({ queryKey: ['commissions', 'client'] })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [clientId, qc])
}
