import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getAllDevis } from '@/features/clients/services/client-service'
import { StatusBadge } from '@/components/shared/status-badge'
import { DEVIS_STATUS_LABELS } from '@/types/enums'
import type { DevisStatus } from '@/types/enums'
import { formatDateShort, formatCurrency } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react'

const DEVIS_STATUS_COLORS: Record<DevisStatus, string> = {
  brouillon: 'bg-gray-100 text-gray-800',
  envoye: 'bg-blue-100 text-blue-800',
  signe: 'bg-green-100 text-green-800',
  refuse: 'bg-red-100 text-red-800',
  expire: 'bg-orange-100 text-orange-800',
}

export function BillingListPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['devis', 'all', page],
    queryFn: () => getAllDevis({ page }),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Devis & Facturation</h1>
        <p className="text-sm text-muted-foreground">
          Tous les devis de l'agence
        </p>
      </div>

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
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Aucun devis</p>
              <p className="text-sm text-muted-foreground mt-1">
                Les devis apparaîtront ici quand vous en créerez depuis les fiches clients.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Montant HT</TableHead>
                  <TableHead className="text-right">Montant TTC</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Créé le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((devis) => (
                  <TableRow
                    key={devis.id}
                    className="cursor-pointer"
                    onClick={() => devis.client?.id && navigate(`/clients/${devis.client.id}`)}
                  >
                    <TableCell className="font-mono text-sm font-medium">
                      {devis.reference || `DEV-${devis.id.slice(0, 8)}`}
                    </TableCell>
                    <TableCell>{devis.client?.company_name || '—'}</TableCell>
                    <TableCell className="text-right">{formatCurrency(devis.amount_ht)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(devis.amount_ttc)}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={DEVIS_STATUS_LABELS[devis.status]}
                        colorClass={DEVIS_STATUS_COLORS[devis.status]}
                      />
                    </TableCell>
                    <TableCell className="text-sm">{formatDateShort(devis.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {data.count} devis — page {data.page}/{data.totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
