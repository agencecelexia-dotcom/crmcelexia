import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useOpportunities } from '../hooks/use-opportunities'
import {
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_STATUS_COLORS,
  OPPORTUNITY_TYPE_LABELS,
  type OpportunityStatus,
  type OpportunityType,
} from '@/types/enums'
import { formatCurrency, formatDateShort } from '@/lib/format'
import { KanbanBoard } from '../components/kanban-board'
import { OpportunityCreateDialog } from '../components/opportunity-create-dialog'
import { PipelineDashboard } from '../components/pipeline-dashboard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, LayoutGrid, List, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

type ViewMode = 'kanban' | 'table'

interface OpportunitiesPageProps {
  opportunityType: OpportunityType
}

export function OpportunitiesPage({ opportunityType }: OpportunitiesPageProps) {
  const navigate = useNavigate()
  const { profile, isFounder } = useAuth()
  const commercialId = isFounder ? undefined : profile?.id
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filters = {
    search: search || undefined,
    status: statusFilter !== 'all' ? [statusFilter as OpportunityStatus] : undefined,
    commercial_id: commercialId,
    opportunity_type: opportunityType,
  }
  const { data: opportunities, isLoading } = useOpportunities(filters)

  const typeLabel = OPPORTUNITY_TYPE_LABELS[opportunityType]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/opportunities')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pipeline {typeLabel}</h1>
            <p className="text-muted-foreground">
              {opportunityType === 'site_web' ? 'Creation de sites web' : 'Local Services Ads — 10% commission'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                viewMode === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <LayoutGrid className="h-4 w-4" /> Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <List className="h-4 w-4" /> Table
            </button>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nouvelle opportunite
          </Button>
        </div>
      </div>

      {/* Dashboard */}
      <PipelineDashboard opportunityType={opportunityType} />

      {/* View */}
      {viewMode === 'kanban' ? (
        <KanbanBoard opportunityType={opportunityType} />
      ) : (
        <>
          {/* Table filters */}
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

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : !opportunities?.data?.length ? (
                <div className="p-12 text-center text-muted-foreground">
                  Aucune opportunite trouvee
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Prospect</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Prix Projet</TableHead>
                      <TableHead className="text-right">Encaisse</TableHead>
                      <TableHead className="text-right">Reste</TableHead>
                      {opportunityType === 'pub' && (
                        <TableHead className="text-right">CA genere</TableHead>
                      )}
                      {opportunityType === 'pub' && (
                        <TableHead className="text-right">Commission</TableHead>
                      )}
                      <TableHead>Closing prevu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opportunities.data.map((opp) => (
                      <TableRow key={opp.id} className="cursor-pointer hover:bg-accent/50" onClick={() => opp.prospect_id && navigate(`/prospects/${opp.prospect_id}`)}>
                        <TableCell className="font-medium">{opp.name}</TableCell>
                        <TableCell>{opp.prospect?.company_name ?? '—'}</TableCell>
                        <TableCell>
                          <StatusBadge
                            label={OPPORTUNITY_STATUS_LABELS[opp.status]}
                            colorClass={OPPORTUNITY_STATUS_COLORS[opp.status]}
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatCurrency(opp.project_price)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-600">
                          {formatCurrency(opp.amount_collected)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-orange-600 font-semibold">
                          {formatCurrency(opp.project_price - opp.amount_collected)}
                        </TableCell>
                        {opportunityType === 'pub' && (
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(opp.revenue_generated || 0)}
                          </TableCell>
                        )}
                        {opportunityType === 'pub' && (
                          <TableCell className="text-right tabular-nums text-amber-600 font-semibold">
                            {formatCurrency((opp.revenue_generated || 0) * 0.10)}
                          </TableCell>
                        )}
                        <TableCell>
                          {opp.expected_close_date ? formatDateShort(opp.expected_close_date) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Create dialog */}
      <OpportunityCreateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        opportunityType={opportunityType}
      />
    </div>
  )
}
