import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useOpportunities, useCreateOpportunity } from '../hooks/use-opportunities'
import { usePipelineStats } from '../hooks/use-opportunities'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  TrendingUp,
  DollarSign,
  Target,
  BarChart3,
  Plus,
} from 'lucide-react'
import { formatCurrency, formatPercentage } from '@/lib/format'
import {
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_STATUS_COLORS,
  type OpportunityStatus,
} from '@/types/enums'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

const STAGE_COLORS: Record<string, string> = {
  qualification: '#6B7280',
  proposition: '#3B82F6',
  negociation: '#F59E0B',
  closing: '#8B5CF6',
}

export function OpportunitiesPage() {
  const { profile, isFounder } = useAuth()
  const commercialId = isFounder ? undefined : profile?.id
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)

  const filters = {
    search: search || undefined,
    status: statusFilter !== 'all' ? [statusFilter as OpportunityStatus] : undefined,
    commercial_id: commercialId,
  }

  const { data: opportunities, isLoading } = useOpportunities(filters)
  const { data: pipeline } = usePipelineStats(commercialId)
  const createMutation = useCreateOpportunity()

  const [form, setForm] = useState({
    name: '',
    prospect_id: '',
    estimated_value: 0,
    probability: 50,
    monthly_recurring: 0,
    expected_close_date: '',
    notes: '',
  })

  const handleCreate = async () => {
    if (!profile || !form.name || !form.estimated_value) return
    await createMutation.mutateAsync({
      prospect_id: form.prospect_id,
      commercial_id: profile.id,
      name: form.name,
      estimated_value: form.estimated_value,
      probability: form.probability,
      monthly_recurring: form.monthly_recurring || null,
      expected_close_date: form.expected_close_date || null,
      notes: form.notes || null,
    })
    setShowCreate(false)
    setForm({ name: '', prospect_id: '', estimated_value: 0, probability: 50, monthly_recurring: 0, expected_close_date: '', notes: '' })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Opportunités</h1>
          <p className="text-muted-foreground">Pipeline commercial et forecast</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Nouvelle opportunité</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Créer une opportunité</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nom *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Refonte site web" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Valeur estimée (EUR) *</Label>
                  <Input type="number" min={0} value={form.estimated_value} onChange={e => setForm(f => ({ ...f, estimated_value: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>Probabilité (%) *</Label>
                  <Input type="number" min={0} max={100} value={form.probability} onChange={e => setForm(f => ({ ...f, probability: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>MRR mensuel</Label>
                  <Input type="number" min={0} value={form.monthly_recurring} onChange={e => setForm(f => ({ ...f, monthly_recurring: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>Date de closing prévue</Label>
                  <Input type="date" value={form.expected_close_date} onChange={e => setForm(f => ({ ...f, expected_close_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Revenu projeté</Label>
                <p className="text-lg font-semibold text-primary">{formatCurrency(form.estimated_value * form.probability / 100)}</p>
              </div>
              <Button onClick={handleCreate} disabled={!form.name || !form.estimated_value || createMutation.isPending} className="w-full">
                {createMutation.isPending ? 'Création...' : 'Créer l\'opportunité'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pipeline KPIs */}
      {pipeline && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Montant en cours"
            value={formatCurrency(pipeline.total_in_progress)}
            icon={DollarSign}
          />
          <StatCard
            title="Prévision closing"
            value={formatCurrency(pipeline.forecast_closing)}
            subtitle="Pondéré par probabilité"
            icon={TrendingUp}
          />
          <StatCard
            title="Projection du mois"
            value={formatCurrency(pipeline.projection_month)}
            icon={Target}
          />
          <StatCard
            title="Opportunités actives"
            value={pipeline.by_stage.reduce((sum, s) => sum + s.count, 0)}
            icon={BarChart3}
          />
        </div>
      )}

      {/* Pipeline by stage chart */}
      {pipeline && pipeline.by_stage.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pipeline par étape</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pipeline.by_stage.map(s => ({
                name: OPPORTUNITY_STATUS_LABELS[s.stage as OpportunityStatus] ?? s.stage,
                amount: s.amount,
                count: s.count,
                fill: STAGE_COLORS[s.stage] ?? '#6B7280',
              }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(Number(v) / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => [formatCurrency(Number(value)), 'Montant']} />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                  {pipeline.by_stage.map((s, i) => (
                    <Cell key={i} fill={STAGE_COLORS[s.stage] ?? '#6B7280'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Rechercher..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {Object.entries(OPPORTUNITY_STATUS_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Opportunities Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : !opportunities?.data?.length ? (
            <div className="p-12 text-center text-muted-foreground">
              Aucune opportunité trouvée
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Prospect</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Valeur estimée</TableHead>
                  <TableHead className="text-right">Probabilité</TableHead>
                  <TableHead className="text-right">Revenu projeté</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead>Closing prévu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opportunities.data.map((opp) => (
                  <TableRow key={opp.id} className="cursor-pointer hover:bg-accent/50">
                    <TableCell className="font-medium">{opp.name}</TableCell>
                    <TableCell>{opp.prospect?.company_name ?? '—'}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={OPPORTUNITY_STATUS_LABELS[opp.status]}
                        colorClass={OPPORTUNITY_STATUS_COLORS[opp.status]}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatCurrency(opp.estimated_value)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercentage(opp.probability, 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-primary font-semibold">
                      {formatCurrency(opp.projected_revenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {opp.monthly_recurring ? formatCurrency(opp.monthly_recurring) : '—'}
                    </TableCell>
                    <TableCell>
                      {opp.expected_close_date ? new Date(opp.expected_close_date).toLocaleDateString('fr-FR') : '—'}
                    </TableCell>
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
