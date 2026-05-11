import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Workflow, AlertTriangle, Loader2, Rocket } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatCard } from '@/components/shared/stat-card'
import { StatusBadge } from '@/components/shared/status-badge'
import { AccompagnementStepper } from '@/components/shared/accompagnement-stepper'
import { useAllClientsAccompagnement } from '../hooks/use-accompagnement'
import {
  ACCOMPAGNEMENT_STATUS_LABELS,
  ACCOMPAGNEMENT_STATUS_COLORS,
  type AccompagnementStatus,
} from '@/types/enums'
import type { ClientAccompagnementSummary } from '../services/accompagnement-service'

const STATUS_ORDER: Record<AccompagnementStatus, number> = {
  blocked: 0,
  on_track: 1,
  launched: 2,
}

function sortSummaries(summaries: ClientAccompagnementSummary[]): ClientAccompagnementSummary[] {
  return summaries.slice().sort((a, b) => {
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (statusDiff !== 0) return statusDiff
    // Within same group: most recent activity first
    return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
  })
}

export function AccompagnementListPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useAllClientsAccompagnement()

  const sorted = useMemo(() => (data ? sortSummaries(data) : []), [data])

  const counts = useMemo(() => {
    const c = { blocked: 0, on_track: 0, launched: 0 }
    sorted.forEach(s => {
      c[s.status]++
    })
    return c
  }, [sorted])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Accompagnement clients</h1>
        <p className="text-sm text-muted-foreground">
          Suivi du flow post-signature : 5 étapes pour mettre chaque client en production.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Bloqués"
          value={counts.blocked}
          subtitle="Pas d'activité depuis +7 jours"
          icon={AlertTriangle}
        />
        <StatCard
          title="En cours"
          value={counts.on_track}
          subtitle="Onboarding actif"
          icon={Loader2}
        />
        <StatCard
          title="Lancés"
          value={counts.launched}
          subtitle="Campagne en ligne"
          icon={Rocket}
        />
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Tous ({sorted.length})</TabsTrigger>
          <TabsTrigger value="blocked">Bloqués ({counts.blocked})</TabsTrigger>
          <TabsTrigger value="on_track">En cours ({counts.on_track})</TabsTrigger>
          <TabsTrigger value="launched">Lancés ({counts.launched})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <AccompagnementTable
            data={sorted}
            isLoading={isLoading}
            onRowClick={(id) => navigate(`/clients/${id}`)}
          />
        </TabsContent>
        <TabsContent value="blocked" className="mt-4">
          <AccompagnementTable
            data={sorted.filter(s => s.status === 'blocked')}
            isLoading={isLoading}
            onRowClick={(id) => navigate(`/clients/${id}`)}
          />
        </TabsContent>
        <TabsContent value="on_track" className="mt-4">
          <AccompagnementTable
            data={sorted.filter(s => s.status === 'on_track')}
            isLoading={isLoading}
            onRowClick={(id) => navigate(`/clients/${id}`)}
          />
        </TabsContent>
        <TabsContent value="launched" className="mt-4">
          <AccompagnementTable
            data={sorted.filter(s => s.status === 'launched')}
            isLoading={isLoading}
            onRowClick={(id) => navigate(`/clients/${id}`)}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface AccompagnementTableProps {
  data: ClientAccompagnementSummary[]
  isLoading: boolean
  onRowClick: (clientId: string) => void
}

function AccompagnementTable({ data, isLoading, onRowClick }: AccompagnementTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </CardContent>
      </Card>
    )
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Workflow className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Aucun client</p>
          <p className="text-sm text-muted-foreground">
            Les clients de cette catégorie apparaîtront ici.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entreprise</TableHead>
                <TableHead>Profession / Ville</TableHead>
                <TableHead>Avancement</TableHead>
                <TableHead>Étape actuelle</TableHead>
                <TableHead className="text-right">Depuis signature</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(s => (
                <TableRow
                  key={s.client.id}
                  className="cursor-pointer hover:bg-accent/50"
                  onClick={() => onRowClick(s.client.id)}
                >
                  <TableCell>
                    <p className="font-medium">{s.client.company_name}</p>
                    {s.client.contact_firstname || s.client.contact_name ? (
                      <p className="text-xs text-muted-foreground">
                        {s.client.contact_firstname} {s.client.contact_name}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{s.client.profession || '—'}</p>
                    <p className="text-xs text-muted-foreground">{s.client.city || '—'}</p>
                  </TableCell>
                  <TableCell>
                    <div onClick={(e) => e.stopPropagation()}>
                      <AccompagnementStepper steps={s.steps} variant="compact" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{s.currentStepLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.completedCount}/{s.steps.length} étapes
                    </p>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {s.daysSinceSignature} j
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={ACCOMPAGNEMENT_STATUS_LABELS[s.status]}
                      colorClass={ACCOMPAGNEMENT_STATUS_COLORS[s.status]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
