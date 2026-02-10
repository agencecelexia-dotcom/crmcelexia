import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClients } from '../hooks/use-clients'
import type { ClientFilters } from '../services/client-service'
import type { ClientStatus } from '@/types/enums'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatDateShort, formatPhone } from '@/lib/format'
import { useDebounce } from '@/hooks/use-debounce'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import { Search, Users, ChevronLeft, ChevronRight } from 'lucide-react'

const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  actif: 'Actif',
  inactif: 'Inactif',
  resilie: 'Résilié',
}

const CLIENT_STATUS_COLORS: Record<ClientStatus, string> = {
  actif: 'bg-green-100 text-green-800',
  inactif: 'bg-gray-100 text-gray-800',
  resilie: 'bg-red-100 text-red-800',
}

export function ClientsListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebounce(search, 300)

  const filters: ClientFilters = {}
  if (debouncedSearch) filters.search = debouncedSearch
  if (statusFilter !== 'all') filters.status = [statusFilter]

  const { data, isLoading } = useClients({ filters, page })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clients</h1>
        <p className="text-sm text-muted-foreground">
          Prospects convertis en clients
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un client..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as ClientStatus | 'all'); setPage(1) }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            {(Object.entries(CLIENT_STATUS_LABELS) as [ClientStatus, string][]).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Aucun client</p>
              <p className="text-sm text-muted-foreground mt-1">
                Les clients apparaîtront ici après conversion de prospects.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entreprise</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Ville</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Commercial</TableHead>
                  <TableHead>Converti le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((client) => (
                  <TableRow
                    key={client.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/clients/${client.id}`)}
                  >
                    <TableCell className="font-medium">{client.company_name}</TableCell>
                    <TableCell>
                      {client.contact_firstname} {client.contact_name}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatPhone(client.phone)}</TableCell>
                    <TableCell>{client.city || '—'}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={CLIENT_STATUS_LABELS[client.status]}
                        colorClass={CLIENT_STATUS_COLORS[client.status]}
                      />
                    </TableCell>
                    <TableCell className="text-sm">{client.commercial?.full_name || '—'}</TableCell>
                    <TableCell className="text-sm">{formatDateShort(client.converted_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {data.count} clients — page {data.page}/{data.totalPages}
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
