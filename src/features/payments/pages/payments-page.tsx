import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { usePayments, usePaymentStats } from '../hooks/use-payments'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import { Clock, AlertTriangle, XCircle, CheckCircle } from 'lucide-react'
import { formatCurrency, formatDateShort } from '@/lib/format'
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, type PaymentStatus } from '@/types/enums'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

const PIE_COLORS: Record<PaymentStatus, string> = {
  paye: '#10B981',
  en_attente: '#F59E0B',
  en_retard: '#F97316',
  impaye: '#EF4444',
}

export function PaymentsPage() {
  const { profile, isFounder } = useAuth()
  const navigate = useNavigate()
  const commercialId = isFounder ? undefined : profile?.id
  const [activeFilter, setActiveFilter] = useState<PaymentStatus | 'all'>('all')

  const paymentFilters = {
    status: activeFilter !== 'all' ? [activeFilter as PaymentStatus] : undefined,
    commercialId,
  }

  const { data: payments, isLoading } = usePayments(paymentFilters)
  const { data: stats } = usePaymentStats(commercialId)

  const pieData = stats ? [
    { name: 'Payé', value: stats.count_paye, color: PIE_COLORS.paye },
    { name: 'En attente', value: stats.count_en_attente, color: PIE_COLORS.en_attente },
    { name: 'En retard', value: stats.count_en_retard, color: PIE_COLORS.en_retard },
    { name: 'Impayé', value: stats.count_impaye, color: PIE_COLORS.impaye },
  ].filter(d => d.value > 0) : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Statut de paiement</h1>
        <p className="text-muted-foreground">Suivi des paiements et factures</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Payé"
            value={formatCurrency(stats.total_paye)}
            subtitle={`${stats.count_paye} paiements`}
            icon={CheckCircle}
            className="border-green-200 bg-green-50/30"
          />
          <StatCard
            title="En attente"
            value={formatCurrency(stats.total_en_attente)}
            subtitle={`${stats.count_en_attente} en attente`}
            icon={Clock}
            className="border-yellow-200 bg-yellow-50/30"
          />
          <StatCard
            title="En retard"
            value={formatCurrency(stats.total_en_retard)}
            subtitle={`${stats.count_en_retard} en retard`}
            icon={AlertTriangle}
            className={stats.count_en_retard > 0 ? 'border-orange-300 bg-orange-50/30' : undefined}
          />
          <StatCard
            title="Impayé"
            value={formatCurrency(stats.total_impaye)}
            subtitle={`${stats.count_impaye} impayés`}
            icon={XCircle}
            className={stats.count_impaye > 0 ? 'border-red-300 bg-red-50/30' : undefined}
          />
        </div>
      )}

      {/* Pie chart + filters */}
      <div className="grid gap-6 md:grid-cols-2">
        {pieData.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Répartition des paiements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2} dataKey="value">
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${value} paiements`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                      <span>{d.name}: <strong>{d.value}</strong></span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filtrer par statut</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={activeFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveFilter('all')}
              >
                Tous
              </Button>
              {(Object.entries(PAYMENT_STATUS_LABELS) as [PaymentStatus, string][]).map(([value, label]) => (
                <Button
                  key={value}
                  variant={activeFilter === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payments table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : !payments?.length ? (
            <div className="p-12 text-center text-muted-foreground">
              Aucun paiement trouvé
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Montant TTC</TableHead>
                  <TableHead>Date d'échéance</TableHead>
                  <TableHead>Date de paiement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow
                    key={payment.id}
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => navigate(`/clients/${payment.clientId}`)}
                  >
                    <TableCell className="font-mono text-sm">{payment.reference}</TableCell>
                    <TableCell className="font-medium">{payment.clientName}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={PAYMENT_STATUS_LABELS[payment.status]}
                        colorClass={PAYMENT_STATUS_COLORS[payment.status]}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                    <TableCell>{payment.due_date ? formatDateShort(payment.due_date) : '—'}</TableCell>
                    <TableCell>{payment.paid_date ? formatDateShort(payment.paid_date) : '—'}</TableCell>
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
