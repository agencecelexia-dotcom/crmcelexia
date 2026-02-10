import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useRendezVous, useUpdateRdv } from '../hooks/use-rdv'
import type { RdvFilters } from '../services/rdv-service'
import type { RdvStatus, RdvType } from '@/types/enums'
import { RDV_STATUS_LABELS, RDV_STATUS_COLORS, RDV_TYPE_LABELS } from '@/types/enums'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CalendarDays,
  Phone,
  Video,
  MapPin,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

const typeIcons: Record<RdvType, typeof Phone> = {
  telephone: Phone,
  visio: Video,
  presentiel: MapPin,
}

export function RdvListPage() {
  const navigate = useNavigate()
  const { isFounder } = useAuth()
  const updateRdv = useUpdateRdv()

  const [statusFilter, setStatusFilter] = useState<RdvStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<RdvType | 'all'>('all')
  const [page, setPage] = useState(1)

  const filters: RdvFilters = {}
  if (statusFilter !== 'all') filters.status = [statusFilter]
  if (typeFilter !== 'all') filters.type = [typeFilter]

  const { data, isLoading } = useRendezVous({
    filters,
    page,
    sortBy: 'scheduled_at',
    sortDesc: false,
  })

  const now = new Date()

  async function quickStatusChange(rdvId: string, newStatus: RdvStatus) {
    try {
      const updates: Record<string, unknown> = { status: newStatus }
      if (newStatus === 'fait') {
        updates.result = 'Fait'
      }
      await updateRdv.mutateAsync({ id: rdvId, updates: updates as never })
      toast.success('Statut mis à jour')
    } catch {
      toast.error('Erreur')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rendez-vous</h1>
          <p className="text-sm text-muted-foreground">
            Gérez vos rendez-vous avec les prospects
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as RdvStatus | 'all'); setPage(1) }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {(Object.entries(RDV_STATUS_LABELS) as [RdvStatus, string][]).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as RdvType | 'all'); setPage(1) }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {(Object.entries(RDV_TYPE_LABELS) as [RdvType, string][]).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(statusFilter !== 'all' || typeFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStatusFilter('all'); setTypeFilter('all'); setPage(1) }}
          >
            Effacer les filtres
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !data || data.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CalendarDays className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Aucun rendez-vous</p>
              <p className="text-sm text-muted-foreground mt-1">
                Les RDV apparaîtront ici quand vous en créerez depuis les fiches prospects.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Prospect</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Durée</TableHead>
                  <TableHead>Statut</TableHead>
                  {isFounder && <TableHead>Commercial</TableHead>}
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((rdv) => {
                  const isPastPrevu = rdv.status === 'prevu' && new Date(rdv.scheduled_at) <= now
                  const TypeIcon = typeIcons[rdv.type]

                  return (
                    <TableRow
                      key={rdv.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/prospects/${rdv.prospect_id}`)}
                    >
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {isPastPrevu && <AlertTriangle className="h-4 w-4 text-orange-500" />}
                          {formatDate(rdv.scheduled_at)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{rdv.prospect?.company_name}</p>
                          {rdv.prospect?.contact_firstname && (
                            <p className="text-xs text-muted-foreground">
                              {rdv.prospect.contact_firstname} {rdv.prospect.contact_name}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <TypeIcon className="h-4 w-4 text-muted-foreground" />
                          {RDV_TYPE_LABELS[rdv.type]}
                        </div>
                      </TableCell>
                      <TableCell>{rdv.duration_minutes} min</TableCell>
                      <TableCell>
                        <StatusBadge
                          label={RDV_STATUS_LABELS[rdv.status]}
                          colorClass={RDV_STATUS_COLORS[rdv.status]}
                        />
                      </TableCell>
                      {isFounder && (
                        <TableCell className="text-sm">{rdv.commercial?.full_name}</TableCell>
                      )}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {rdv.status === 'prevu' && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => quickStatusChange(rdv.id, 'fait')}
                              title="Marquer fait"
                            >
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => quickStatusChange(rdv.id, 'no_show')}
                              title="No-show"
                            >
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => quickStatusChange(rdv.id, 'annule')}
                              title="Annuler"
                            >
                              <XCircle className="h-4 w-4 text-gray-500" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {data.count} rendez-vous au total — page {data.page}/{data.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
