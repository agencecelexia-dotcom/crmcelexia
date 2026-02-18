import { useAuth } from '@/features/auth/hooks/use-auth'
import { useContracts, useContractStats } from '../hooks/use-contracts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/shared/stat-card'
import { StatusBadge } from '@/components/shared/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useNavigate } from 'react-router-dom'
import { FileCheck, DollarSign, TrendingUp, Briefcase } from 'lucide-react'
import { formatCurrency, formatDateShort } from '@/lib/format'
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, type ProjectStatus } from '@/types/enums'

export function ContractsPage() {
  const { profile, isFounder } = useAuth()
  const navigate = useNavigate()
  const commercialId = isFounder ? undefined : profile?.id
  const { data: contracts, isLoading } = useContracts(commercialId)
  const { data: stats } = useContractStats(commercialId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contrats</h1>
        <p className="text-muted-foreground">Tous les contrats signés et leur historique</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total contrats"
            value={stats.total_contracts}
            icon={FileCheck}
          />
          <StatCard
            title="Valeur totale HT"
            value={formatCurrency(stats.total_value_ht)}
            icon={DollarSign}
          />
          <StatCard
            title="MRR total"
            value={formatCurrency(stats.total_mrr)}
            subtitle="Récurrent mensuel"
            icon={TrendingUp}
          />
          <StatCard
            title="Contrats actifs"
            value={stats.active_contracts}
            icon={Briefcase}
          />
        </div>
      )}

      {/* Contracts list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Liste des contrats</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : !contracts?.length ? (
            <div className="p-12 text-center text-muted-foreground">
              Aucun contrat signé
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Projet</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Montant HT</TableHead>
                  <TableHead className="text-right">Montant TTC</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead>Signé le</TableHead>
                  <TableHead>Début</TableHead>
                  <TableHead>Fin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => (
                  <TableRow
                    key={contract.id}
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => navigate(`/clients/${contract.clientId}`)}
                  >
                    <TableCell className="font-mono text-sm">{contract.reference}</TableCell>
                    <TableCell className="font-medium">{contract.clientName}</TableCell>
                    <TableCell>{contract.projectName ?? '—'}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={PROJECT_STATUS_LABELS[contract.status as ProjectStatus] ?? contract.status}
                        colorClass={PROJECT_STATUS_COLORS?.[contract.status as ProjectStatus] ?? 'bg-gray-100 text-gray-800'}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(contract.amount_ht)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(contract.amount_ttc)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {contract.monthly_amount ? formatCurrency(contract.monthly_amount) : '—'}
                    </TableCell>
                    <TableCell>{contract.signed_at ? formatDateShort(contract.signed_at) : '—'}</TableCell>
                    <TableCell>{contract.start_date ? formatDateShort(contract.start_date) : '—'}</TableCell>
                    <TableCell>{contract.end_date ? formatDateShort(contract.end_date) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
