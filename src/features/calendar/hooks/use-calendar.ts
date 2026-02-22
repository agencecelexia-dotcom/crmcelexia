import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCalendarEvents, createManualEvent, deleteManualEvent } from '../services/calendar-service'
import type { CreateManualEventInput } from '../services/calendar-service'
import { STALE_TIME_DASHBOARD } from '@/lib/constants'
import { updateReminder, deleteReminder, completeReminder } from '@/features/prospection/services/reminder-service'
import { rescheduleRdv, updateRdv } from '@/features/rendez-vous/services/rdv-service'
import type { RdvStatus } from '@/types/enums'
import { toast } from 'sonner'

export function useCalendarEvents(startDate: string, endDate: string, commercialId?: string) {
  return useQuery({
    queryKey: ['calendar', 'events', startDate, endDate, commercialId],
    queryFn: () => getCalendarEvents(startDate, endDate, commercialId),
    staleTime: STALE_TIME_DASHBOARD,
    enabled: !!startDate && !!endDate,
  })
}

export function useCreateCalendarEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateManualEventInput) => createManualEvent(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}

export function useDeleteCalendarEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteManualEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}

export function useRescheduleRdv() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { rdvId: string; newScheduledAt: string; newDurationMinutes?: number }) =>
      rescheduleRdv(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rdv'] })
      qc.invalidateQueries({ queryKey: ['calendar'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['prospects'] })
      toast.success('RDV reprogrammé (ancien marqué no-show)')
    },
    onError: () => toast.error('Erreur lors de la reprogrammation du RDV'),
  })
}

export function useCancelRdv() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rdvId: string) =>
      updateRdv({ id: rdvId, updates: { status: 'annule' as RdvStatus } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rdv'] })
      qc.invalidateQueries({ queryKey: ['calendar'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('RDV annulé')
    },
    onError: () => toast.error('Erreur lors de l\'annulation du RDV'),
  })
}

export function useRescheduleReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { id: string; remind_at: string }) =>
      updateReminder(params.id, { remind_at: params.remind_at }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] })
      qc.invalidateQueries({ queryKey: ['reminders'] })
      qc.invalidateQueries({ queryKey: ['prospects'] })
      toast.success('Rappel reprogrammé')
    },
    onError: () => toast.error('Erreur lors de la reprogrammation du rappel'),
  })
}

export function useCompleteReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => completeReminder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] })
      qc.invalidateQueries({ queryKey: ['reminders'] })
      qc.invalidateQueries({ queryKey: ['prospects'] })
      toast.success('Rappel marqué comme fait')
    },
    onError: () => toast.error('Erreur lors de la complétion du rappel'),
  })
}

export function useDeleteReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteReminder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] })
      qc.invalidateQueries({ queryKey: ['reminders'] })
      qc.invalidateQueries({ queryKey: ['prospects'] })
      toast.success('Rappel supprimé')
    },
    onError: () => toast.error('Erreur lors de la suppression du rappel'),
  })
}
