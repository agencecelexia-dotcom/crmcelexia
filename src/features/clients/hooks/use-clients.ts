import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getClients,
  getClient,
  updateClient,
  convertProspectToClient,
  getProjectForClient,
  createProject,
  updateProject,
  getProjectNotes,
  createProjectNote,
  getDevisForClient,
  createDevis,
  updateDevis,
  type ClientFilters,
} from '../services/client-service'
import type { Client, Project, Devis } from '@/types'
import { STALE_TIME_LIST } from '@/lib/constants'

interface UseClientsParams {
  filters?: ClientFilters
  page?: number
  pageSize?: number
  sortBy?: string
  sortDesc?: boolean
}

export function useClients(params: UseClientsParams = {}) {
  return useQuery({
    queryKey: ['clients', 'list', params],
    queryFn: () => getClients(params),
    staleTime: STALE_TIME_LIST,
  })
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: ['client', id],
    queryFn: () => getClient(id!),
    enabled: !!id,
  })
}

export function useUpdateClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Client> }) =>
      updateClient(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['client'] })
    },
  })
}

export function useConvertProspect() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (prospectId: string) => convertProspectToClient(prospectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// Projects
export function useProjectForClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ['project', 'client', clientId],
    queryFn: () => getProjectForClient(clientId!),
    enabled: !!clientId,
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: Parameters<typeof createProject>[0]) => createProject(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project'] })
      queryClient.invalidateQueries({ queryKey: ['client'] })
    },
  })
}

export function useUpdateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Project> }) =>
      updateProject(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project'] })
    },
  })
}

// Project notes
export function useProjectNotes(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-notes', projectId],
    queryFn: () => getProjectNotes(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateProjectNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: Parameters<typeof createProjectNote>[0]) => createProjectNote(params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-notes', variables.project_id] })
    },
  })
}

// Devis
export function useDevisForClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ['devis', 'client', clientId],
    queryFn: () => getDevisForClient(clientId!),
    enabled: !!clientId,
  })
}

export function useCreateDevis() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: Parameters<typeof createDevis>[0]) => createDevis(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devis'] })
    },
  })
}

export function useUpdateDevis() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Devis> }) =>
      updateDevis(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devis'] })
    },
  })
}
