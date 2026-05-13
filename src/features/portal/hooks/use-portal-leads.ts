import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPortalLeads, getPortalLead, createPortalLead, updatePortalLeadStatus,
  updatePortalLead, deletePortalLead, getPortalLeadEvents, getPortalLeadStats,
  declareCommissionPaid, validateCommissionPayment, markPortalLeadSigned,
} from '../services/portal-lead-service'
import type { PortalLead } from '@/types'
import { describeError } from '../lib/error-utils'
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

// ── Commission payment tracking ──

export function useDeclareCommissionPaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (leadId: string) => declareCommissionPaid(leadId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-leads'] })
      qc.invalidateQueries({ queryKey: ['portal-lead'] })
      qc.invalidateQueries({ queryKey: ['admin-commissions-pending'] })
      toast.success('Paiement déclaré. Celexia validera sous quelques jours.')
    },
    onError: (err) => toast.error(`Déclaration échouée : ${describeError(err)}`),
  })
}

export function useMarkPortalLeadSigned() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, amount, signedAt }: { leadId: string; amount: number; signedAt: string }) =>
      markPortalLeadSigned(leadId, amount, signedAt),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-leads'] })
      qc.invalidateQueries({ queryKey: ['portal-lead'] })
      qc.invalidateQueries({ queryKey: ['portal-lead-stats'] })
      qc.invalidateQueries({ queryKey: ['portal-lead-events'] })
    },
    onError: (err) => toast.error(`Signature échouée : ${describeError(err)}`),
  })
}

export function useValidateCommissionPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, approved, notes }: { leadId: string; approved: boolean; notes?: string }) =>
      validateCommissionPayment(leadId, approved, notes),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['portal-leads'] })
      qc.invalidateQueries({ queryKey: ['portal-lead'] })
      qc.invalidateQueries({ queryKey: ['admin-commissions-pending'] })
      toast.success(vars.approved ? 'Commission validée' : 'Commission marquée à clarifier')
    },
    onError: (err) => toast.error(`Action échouée : ${describeError(err)}`),
  })
}
