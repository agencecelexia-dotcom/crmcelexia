import { useAuth } from '@/features/auth/hooks/use-auth'
import {
  useUpcomingRdvs,
  usePastUnconvertedRdvs,
  useSignedClients,
  useRdvCountThisMonth,
  useSignedCountThisMonth,
  useCallCounts,
  useConversionRate,
} from '../hooks/use-my-pipeline'
import { StatCard } from '@/components/shared/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, UserCheck, TrendingUp, Phone, ExternalLink, CalendarClock, CalendarX, Trophy } from 'lucide-react'
import { RDV_STATUS_LABELS, RDV_STATUS_COLORS, OPPORTUNITY_TYPE_LABELS } from '@/types/enums'
import type { RdvStatus, OpportunityType } from '@/types/enums'
import type { RendezVous } from '@/types'
import { formatDate, formatDateShort } from '@/lib/format'

export function MyPipelinePage() {
  const { profile, isFounder } = useAuth()
  const commercialId = isFounder ? undefined : profile?.id

  const { data: upcomingRdvs, isLoading: loadingUpcoming } = useUpcomingRdvs(commercialId)
  const { data: pastRdvs, isLoading: loadingPast } = usePastUnconvertedRdvs(commercialId)
  const { data: signedClients, isLoading: loadingSigned } = useSignedClients(commercialId)
  const { data: rdvCount } = useRdvCountThisMonth(commercialId)
  const { data: signedCount } = useSignedCountThisMonth(commercialId)
  const { data: callCounts } = useCallCounts(commercialId)
  const { data: conversionRate } = useConversionRate(commercialId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mon Pipeline</h1>
        <p className="text-muted-foreground">
          {isFounder ? 'Vue globale du pipeline commercial' : 'Suivi de vos RDV et conversions'}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="RDVs ce mois"
          value={rdvCount ?? '...'}
          icon={CalendarDays}
        />
        <StatCard
          title="Clients sign. ce mois"
          value={signedCount ?? '...'}
          icon={UserCheck}
          className="border-emerald-200 bg-emerald-50/30"
        />
        <StatCard
          title="Taux de conversion"
          value={conversionRate !== undefined ? `${conversionRate}%` : '...'}
          icon={TrendingUp}
        />
        <StatCard
          title="Appels"
          value={callCounts ? `${callCounts.week} / ${callCounts.month}` : '...'}
          subtitle="semaine / mois"
          icon={Phone}
        />
      </div>

      {/* Section 1: Upcoming RDVs */}
      <RdvSection
        title="RDVs a venir"
        icon={<CalendarClock className="h-4 w-4 text-blue-600" />}
        rdvs={upcomingRdvs}
        isLoading={loadingUpcoming}
        emptyMessage="Aucun RDV a venir"
        accentClass="border-blue-200"
      />

      {/* Section 2: Past unconverted RDVs */}
      <RdvSection
        title="RDVs passes (non closes)"
        icon={<CalendarX className="h-4 w-4 text-orange-600" />}
        rdvs={pastRdvs}
        isLoading={loadingPast}
        emptyMessage="Aucun RDV passe non close"
        accentClass="border-orange-200"
      />

      {/* Section 3: Signed clients */}
      <SignedClientsSection
        signedClients={signedClients}
        isLoading={loadingSigned}
      />
    </div>
  )
}

// ── RDV table section ──
function RdvSection({
  title,
  icon,
  rdvs,
  isLoading,
  emptyMessage,
  accentClass,
}: {
  title: string
  icon: React.ReactNode
  rdvs: RendezVous[] | undefined
  isLoading: boolean
  emptyMessage: string
  accentClass: string
}) {
  const navigate = useNavigate()

  return (
    <Card className={accentClass}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
          {rdvs && <Badge variant="secondary" className="ml-1">{rdvs.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !rdvs || rdvs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{emptyMessage}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prospect</TableHead>
                  <TableHead>Date RDV</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Type RDV</TableHead>
                  <TableHead className="text-right">Fiche</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rdvs.map((rdv) => (
                  <TableRow key={rdv.id}>
                    <TableCell className="font-medium">
                      {rdv.prospect?.company_name ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(rdv.scheduled_at)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={RDV_STATUS_COLORS[rdv.status as RdvStatus] ?? ''}
                      >
                        {RDV_STATUS_LABELS[rdv.status as RdvStatus] ?? rdv.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {rdv.booking_type ? (
                        <Badge variant="outline" className="text-xs">
                          {OPPORTUNITY_TYPE_LABELS[rdv.booking_type as OpportunityType] ?? rdv.booking_type}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/prospects/${rdv.prospect_id}`)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Signed clients section ──
function SignedClientsSection({
  signedClients,
  isLoading,
}: {
  signedClients: { id: string; company_name: string; contact_name: string | null; converted_at: string | null; last_rdv_date: string | null; last_rdv_booking_type: string | null }[] | undefined
  isLoading: boolean
}) {
  const navigate = useNavigate()

  return (
    <Card className="border-emerald-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-emerald-600" />
          Clients signes
          {signedClients && <Badge variant="secondary" className="ml-1">{signedClients.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !signedClients || signedClients.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Aucun client signe</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prospect</TableHead>
                  <TableHead>Date RDV</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date signature</TableHead>
                  <TableHead className="text-right">Fiche</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signedClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">{client.company_name}</TableCell>
                    <TableCell className="text-sm">
                      {client.last_rdv_date ? formatDateShort(client.last_rdv_date) : '—'}
                    </TableCell>
                    <TableCell>
                      {client.last_rdv_booking_type ? (
                        <Badge variant="outline" className="text-xs">
                          {OPPORTUNITY_TYPE_LABELS[client.last_rdv_booking_type as OpportunityType] ?? client.last_rdv_booking_type}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {client.converted_at ? formatDateShort(client.converted_at) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/prospects/${client.id}`)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
