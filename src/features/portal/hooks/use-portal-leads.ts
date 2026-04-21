import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPortalLeads, getPortalLead, createPortalLead, updatePortalLeadStatus,
  updatePortalLead, deletePortalLead, getPortalLeadEvents, getPortalLeadStats,
} from '../services/portal-lead-service'
import type { PortalLead } from '@/types'
import { toast } from 'sonner'

export function usePortalLeads(clientId: string | undefined) {
  return useQuery({
    queryKey: ['portal-leads', clientId],
    queryFn: () => getPortalLeads(clientId!),
    enabled: !!clientId,
  })
}

export function usePortalLead(id: string | undefined) {
  return useQuery({
    queryKey: ['portal-lead', id],
    queryFn: () => getPortalLead(id!),
    enabled: !!id,
  })
}

export function usePortalLeadStats(clientId: string | undefined) {
  return useQuery({
    queryKey: ['portal-lead-stats', clientId],
    queryFn: () => getPortalLeadStats(clientId!),
    enabled: !!clientId,
  })
}

export function usePortalLeadEvents(leadId: string | undefined) {
  return useQuery({
    queryKey: ['portal-lead-events', leadId],
    queryFn: () => getPortalLeadEvents(leadId!),
    enabled: !!leadId,
  })
}

export function useCreatePortalLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createPortalLead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-leads'] })
      qc.invalidateQueries({ queryKey: ['portal-lead-stats'] })
      toast.success('Lead créé')
    },
    onError: () => toast.error('Erreur lors de la création'),
  })
}

export function useUpdatePortalLeadStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, newStatus, oldStatus, extra }: {
      id: string; newStatus: string; oldStatus: string; extra?: Partial<PortalLead>
    }) => updatePortalLeadStatus(id, newStatus, oldStatus, extra),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-leads'] })
      qc.invalidateQueries({ queryKey: ['portal-lead'] })
      qc.invalidateQueries({ queryKey: ['portal-lead-stats'] })
      qc.invalidateQueries({ queryKey: ['portal-lead-events'] })
    },
    onError: () => toast.error('Erreur lors du changement de statut'),
  })
}

export function useUpdatePortalLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<PortalLead> }) =>
      updatePortalLead(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-leads'] })
      qc.invalidateQueries({ queryKey: ['portal-lead'] })
    },
  })
}

export function useDeletePortalLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deletePortalLead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-leads'] })
      qc.invalidateQueries({ queryKey: ['portal-lead-stats'] })
      toast.success('Lead supprimé')
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  })
}
