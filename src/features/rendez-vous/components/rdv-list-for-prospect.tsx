import { useRdvForProspect, useUpdateRdv } from '../hooks/use-rdv'
import { formatDate } from '@/lib/format'
import { StatusBadge } from '@/components/shared/status-badge'
import { RDV_STATUS_LABELS, RDV_STATUS_COLORS, RDV_TYPE_LABELS } from '@/types/enums'
import type { RdvStatus } from '@/types/enums'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { CalendarDays, MapPin, Video, Phone, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'
import { Input } from '@/components/ui/input'

interface RdvListForProspectProps {
  prospectId: string
}

const typeIcons = {
  telephone: Phone,
  visio: Video,
  presentiel: MapPin,
}

export function RdvListForProspect({ prospectId }: RdvListForProspectProps) {
  const { data: rdvs, isLoading } = useRdvForProspect(prospectId)
  const updateRdv = useUpdateRdv()
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [completionResult, setCompletionResult] = useState('')

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    )
  }

  if (!rdvs || rdvs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Aucun rendez-vous planifié.
      </p>
    )
  }

  async function handleStatusChange(rdvId: string, newStatus: RdvStatus) {
    if (newStatus === 'fait') {
      setCompletingId(rdvId)
      return
    }
    try {
      await updateRdv.mutateAsync({
        id: rdvId,
        updates: { status: newStatus },
      })
      toast.success('Statut du RDV mis à jour')
    } catch {
      toast.error('Erreur')
    }
  }

  async function handleCompleteRdv(rdvId: string) {
    if (!completionResult.trim()) {
      toast.error('Le résultat est obligatoire pour un RDV fait')
      return
    }
    try {
      await updateRdv.mutateAsync({
        id: rdvId,
        updates: { status: 'fait', result: completionResult.trim() },
      })
      toast.success('RDV marqué comme fait')
      setCompletingId(null)
      setCompletionResult('')
    } catch {
      toast.error('Erreur')
    }
  }

  const now = new Date()

  return (
    <div className="space-y-3">
      {rdvs.map((rdv) => {
        const isPast = rdv.status === 'prevu' && new Date(rdv.scheduled_at) <= now
        const TypeIcon = typeIcons[rdv.type] || CalendarDays

        return (
          <div
            key={rdv.id}
            className={cn(
              'rounded-lg border p-3 space-y-2',
              rdv.status === 'fait' && 'opacity-60',
              rdv.status === 'no_show' && 'border-red-200 bg-red-50/50',
              isPast && 'border-orange-200 bg-orange-50/50',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TypeIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">{formatDate(rdv.scheduled_at)}</span>
                <span className="text-xs text-muted-foreground">
                  ({rdv.duration_minutes} min · {RDV_TYPE_LABELS[rdv.type]})
                </span>
              </div>
              <StatusBadge
                label={RDV_STATUS_LABELS[rdv.status]}
                colorClass={RDV_STATUS_COLORS[rdv.status]}
              />
            </div>

            {rdv.location && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {rdv.location}
              </p>
            )}

            {rdv.result && (
              <p className="text-sm"><span className="text-muted-foreground">Résultat :</span> {rdv.result}</p>
            )}

            {rdv.notes && (
              <p className="text-sm text-muted-foreground">{rdv.notes}</p>
            )}

            {isPast && (
              <div className="flex items-center gap-1 text-xs text-orange-600">
                <AlertTriangle className="h-3 w-3" />
                RDV passé — mettre à jour le statut
              </div>
            )}

            {/* Actions for pending RDV */}
            {rdv.status === 'prevu' && (
              <div className="flex gap-2 pt-1">
                {completingId === rdv.id ? (
                  <div className="flex gap-2 w-full">
                    <Input
                      value={completionResult}
                      onChange={(e) => setCompletionResult(e.target.value)}
                      placeholder="Résultat du RDV (obligatoire)..."
                      className="h-8 text-sm flex-1"
                    />
                    <Button size="sm" variant="default" onClick={() => handleCompleteRdv(rdv.id)}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> OK
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setCompletingId(null); setCompletionResult('') }}>
                      <XCircle className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange(rdv.id, 'fait')}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Fait
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange(rdv.id, 'no_show')}>
                      <AlertTriangle className="h-3 w-3 mr-1" /> No-show
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleStatusChange(rdv.id, 'annule')}>
                      <XCircle className="h-3 w-3 mr-1" /> Annuler
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
