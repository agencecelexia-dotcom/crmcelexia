import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import {
  addToLibrary,
  createQuote,
  getQuoteSettings,
  getQuoteWithItems,
  incrementLibraryUsage,
  listLibrary,
  listQuotes,
  removeFromLibrary,
  replaceQuoteItems,
  softDeleteQuote,
  updateQuote,
  uploadQuoteLogo,
  upsertQuoteSettings,
  type AddLibraryInput,
  type CreateQuoteInput,
  type ReplaceItemInput,
} from '../services/quote-service'
import { describeError } from '../lib/error-utils'
import type { Quote, QuoteSettings, QuoteStatus } from '@/types'

// ──────────────────────────────────────────────────────────
// Settings
// ──────────────────────────────────────────────────────────

export function useQuoteSettings(clientId: string | undefined) {
  return useQuery({
    queryKey: ['quote-settings', clientId],
    queryFn: () => getQuoteSettings(clientId!),
    enabled: !!clientId,
    refetchOnWindowFocus: true,
  })
}

export function useUpsertQuoteSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ clientId, updates }: {
      clientId: string
      updates: Partial<Omit<QuoteSettings, 'client_id' | 'created_at' | 'updated_at'>>
    }) => upsertQuoteSettings(clientId, updates),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['quote-settings', vars.clientId] })
    },
    onError: (err) => toast.error(`Impossible d'enregistrer : ${describeError(err)}`),
  })
}

export function useUploadQuoteLogo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ clientId, file }: { clientId: string; file: File }) =>
      uploadQuoteLogo(clientId, file).then(async (path) => {
        await upsertQuoteSettings(clientId, { logo_path: path })
        return path
      }),
    onSuccess: (_path, vars) => {
      qc.invalidateQueries({ queryKey: ['quote-settings', vars.clientId] })
      toast.success('Logo mis à jour')
    },
    onError: (err) => toast.error(`Upload échoué : ${describeError(err)}`),
  })
}

// ──────────────────────────────────────────────────────────
// Quotes
// ──────────────────────────────────────────────────────────

export function useQuotesList(clientId: string | undefined, status?: QuoteStatus) {
  const qc = useQueryClient()

  // Realtime sync (auto-invalidates on quote changes for this client)
  useEffect(() => {
    if (!clientId) return
    const channel = supabase
      .channel(`quotes-list-${clientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quotes', filter: `client_id=eq.${clientId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['quotes', clientId] })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [clientId, qc])

  return useQuery({
    queryKey: ['quotes', clientId, status ?? 'all'],
    queryFn: () => listQuotes(clientId!, status),
    enabled: !!clientId,
  })
}

export function useQuote(id: string | undefined) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`quote-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quotes', filter: `id=eq.${id}` },
        () => { qc.invalidateQueries({ queryKey: ['quote', id] }) },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quote_items', filter: `quote_id=eq.${id}` },
        () => { qc.invalidateQueries({ queryKey: ['quote', id] }) },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id, qc])

  return useQuery({
    queryKey: ['quote', id],
    queryFn: () => getQuoteWithItems(id!),
    enabled: !!id,
    retry: 1,
  })
}

export function useCreateQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateQuoteInput) => createQuote(input),
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: ['quotes', quote.client_id] })
      toast.success('Devis créé')
    },
    onError: (err) => toast.error(`Création échouée : ${describeError(err)}`),
  })
}

export function useUpdateQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Quote> }) =>
      updateQuote(id, updates),
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: ['quote', quote.id] })
      qc.invalidateQueries({ queryKey: ['quotes', quote.client_id] })
    },
    onError: (err) => toast.error(`Mise à jour échouée : ${describeError(err)}`),
  })
}

export function useSoftDeleteQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => softDeleteQuote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] })
      qc.invalidateQueries({ queryKey: ['quote'] })
      toast.success('Devis supprimé')
    },
    onError: (err) => toast.error(`Suppression échouée : ${describeError(err)}`),
  })
}

export function useReplaceQuoteItems() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ quoteId, items }: { quoteId: string; items: ReplaceItemInput[] }) =>
      replaceQuoteItems(quoteId, items),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['quote', vars.quoteId] })
      qc.invalidateQueries({ queryKey: ['quotes'] })
    },
    onError: (err) => toast.error(`Sauvegarde des lignes échouée : ${describeError(err)}`),
  })
}

// ──────────────────────────────────────────────────────────
// Library
// ──────────────────────────────────────────────────────────

export function useQuoteLibrary(clientId: string | undefined) {
  return useQuery({
    queryKey: ['quote-library', clientId],
    queryFn: () => listLibrary(clientId!),
    enabled: !!clientId,
  })
}

export function useAddToLibrary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ clientId, item }: { clientId: string; item: AddLibraryInput }) =>
      addToLibrary(clientId, item),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['quote-library', vars.clientId] })
    },
    onError: (err) => toast.error(`Ajout échoué : ${describeError(err)}`),
  })
}

export function useRemoveFromLibrary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => removeFromLibrary(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quote-library'] }),
    onError: (err) => toast.error(`Suppression échouée : ${describeError(err)}`),
  })
}

export function useIncrementLibraryUsage() {
  return useMutation({
    mutationFn: (id: string) => incrementLibraryUsage(id),
  })
}
