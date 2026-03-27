import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCommissionsForClient,
  createCommission,
  updateCommissionStatus,
  getBudgetPaymentsForClient,
  createBudgetPayment,
  getInvoicesForClient,
  uploadInvoice,
  softDeleteInvoice,
  type Commission,
} from '../services/financial-service'
import { toast } from 'sonner'

// ── Commissions ──
export function useCommissionsForClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ['commissions', 'client', clientId],
    queryFn: () => getCommissionsForClient(clientId!),
    enabled: !!clientId,
  })
}

export function useCreateCommission() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: Parameters<typeof createCommission>[0]) => createCommission(params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['commissions', 'client', variables.client_id] })
    },
    onError: () => toast.error('Erreur lors de l\'ajout de la commission'),
  })
}

export function useUpdateCommissionStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Commission['status'] }) =>
      updateCommissionStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] })
    },
    onError: () => toast.error('Erreur lors de la mise a jour du statut'),
  })
}

// ── Budget Payments ──
export function useBudgetPaymentsForClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ['budget-payments', 'client', clientId],
    queryFn: () => getBudgetPaymentsForClient(clientId!),
    enabled: !!clientId,
  })
}

export function useCreateBudgetPayment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: Parameters<typeof createBudgetPayment>[0]) => createBudgetPayment(params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['budget-payments', 'client', variables.client_id] })
    },
    onError: () => toast.error('Erreur lors de l\'ajout du versement'),
  })
}

// ── Invoices ──
export function useInvoicesForClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ['invoices', 'client', clientId],
    queryFn: () => getInvoicesForClient(clientId!),
    enabled: !!clientId,
  })
}

export function useUploadInvoice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: Parameters<typeof uploadInvoice>[0]) => uploadInvoice(params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices', 'client', variables.clientId] })
    },
    onError: () => toast.error('Erreur lors de l\'upload de la facture'),
  })
}

export function useSoftDeleteInvoice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => softDeleteInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: () => toast.error('Erreur lors de la suppression de la facture'),
  })
}
