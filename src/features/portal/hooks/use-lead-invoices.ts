import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  deleteLeadInvoice,
  listLeadInvoices,
  uploadLeadInvoice,
  type UploadLeadInvoiceInput,
} from '../services/portal-lead-invoice-service'
import { describeError } from '../lib/error-utils'

export function useLeadInvoices(leadId: string | undefined) {
  return useQuery({
    queryKey: ['lead-invoices', leadId],
    queryFn: () => listLeadInvoices(leadId!),
    enabled: !!leadId,
  })
}

export function useUploadLeadInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UploadLeadInvoiceInput) => uploadLeadInvoice(input),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['lead-invoices', vars.leadId] })
      toast.success('Facture ajoutée')
    },
    onError: (err) => toast.error(`Upload échoué : ${describeError(err)}`),
  })
}

export function useDeleteLeadInvoice(leadId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (invoiceId: string) => deleteLeadInvoice(invoiceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-invoices', leadId] })
      toast.success('Facture supprimée')
    },
    onError: (err) => toast.error(`Suppression échouée : ${describeError(err)}`),
  })
}
