import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getContractsForClient,
  uploadContract,
  softDeleteContract,
} from '../services/contract-service'
import { toast } from 'sonner'

export function useContractsForClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ['contracts', 'client', clientId],
    queryFn: () => getContractsForClient(clientId!),
    enabled: !!clientId,
  })
}

export function useUploadContract() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: Parameters<typeof uploadContract>[0]) => uploadContract(params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contracts', 'client', variables.clientId] })
    },
    onError: () => toast.error('Erreur lors de l\'upload du contrat'),
  })
}

export function useSoftDeleteContract() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => softDeleteContract(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
    },
    onError: () => toast.error('Erreur lors de la suppression du contrat'),
  })
}
