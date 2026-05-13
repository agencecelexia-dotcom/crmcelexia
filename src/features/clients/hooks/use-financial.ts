import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCommissionsForClient,
  getInvoicesForClient,
  uploadInvoice,
  softDeleteInvoice,
} from '../services/financial-service'
import { toast } from 'sonner'

// ── Commissions (lecture seule, agrégées depuis portal_leads) ──
//
// La création/modification de commission est désormais pilotée par le
// workflow portail artisan → admin :
//   - Artisan : useDeclareCommissionPaid (clic "J'ai payé")
//   - Admin   : useValidateCommissionPayment (clic Valider/Refuser
//               dans la carte Accompagnement)
// Les anciens hooks useCreateCommission/useUpdateCommissionStatus ont
// donc été retirés. Idem pour useBudgetPayments* (table dropée 00100).
export function useCommissionsForClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ['commissions', 'client', clientId],
    queryFn: () => getCommissionsForClient(clientId!),
    enabled: !!clientId,
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
