import { usePortalAuth } from '../hooks/use-portal-auth'
import { usePortalLeads, usePortalLeadStats } from '../hooks/use-portal-leads'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Skeleton } from '@/components/ui/skeleton'
import { Euro, TrendingUp, CheckCircle2, Info } from 'lucide-react'

function formatEur(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0 }) + ' €'
}

export function PortalCommissionPage() {
  const { client } = usePortalAuth()
  const { data: leads, isLoading } = usePortalLeads(client?.id)
  const { data: stats } = usePortalLeadStats(client?.id)

  const signedLeads = (leads ?? []).filter(l => l.status === 'signe' && l.signed_amount)

  if (isLoading) {
    return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
          Commission
        </h1>
        <p className="text-sm text-gray-500 mt-1">Transparence totale sur vos commissions</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-violet-600 to-violet-800 text-white border-0">
          <CardContent className="pt-5 pb-4">
            <Euro className="h-5 w-5 text-violet-200 mb-2" />
            <p className="text-xs text-violet-200 font-medium">À payer ce mois</p>
            <p className="text-2xl font-bold mt-1" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
              {formatEur(stats?.commission_this_month || 0)} HT
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 mb-2" />
            <p className="text-xs text-gray-500 font-medium">Devis signés</p>
            <p className="text-2xl font-bold text-gray-900 mt-1" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
              {stats?.signed_count || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <TrendingUp className="h-5 w-5 text-violet-500 mb-2" />
            <p className="text-xs text-gray-500 font-medium">Cumul 2026</p>
            <p className="text-2xl font-bold text-gray-900 mt-1" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
              {formatEur(stats?.total_commission || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Commission table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Détail des commissions</CardTitle>
        </CardHeader>
        <CardContent>
          {signedLeads.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Prospect</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Devis HT</TableHead>
                  <TableHead className="text-right">Commission 10%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signedLeads.map(lead => (
                  <TableRow key={lead.id}>
                    <TableCell className="text-sm">{lead.signed_at || '—'}</TableCell>
                    <TableCell className="text-sm font-medium">{lead.name}</TableCell>
                    <TableCell className="text-sm">{lead.work_type}</TableCell>
                    <TableCell className="text-sm text-right">{formatEur(lead.signed_amount!)}</TableCell>
                    <TableCell className="text-sm text-right font-semibold text-violet-700">
                      {formatEur(lead.commission_amount || 0)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-gray-50 font-semibold">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right">{formatEur(stats?.total_ca || 0)}</TableCell>
                  <TableCell className="text-right text-violet-700">{formatEur(stats?.total_commission || 0)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-gray-400 py-8 text-center">Aucun devis signé pour le moment</p>
          )}
        </CardContent>
      </Card>

      {/* How it works */}
      <Accordion type="single" collapsible>
        <AccordionItem value="how-it-works">
          <AccordionTrigger className="text-sm font-semibold">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-violet-600" />
              Comment fonctionne la commission ?
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 text-sm text-gray-600 pt-2">
              <div className="flex gap-3">
                <Badge className="bg-violet-100 text-violet-700 shrink-0">1</Badge>
                <p>Celexia vous génère des leads qualifiés via Google Ads.</p>
              </div>
              <div className="flex gap-3">
                <Badge className="bg-violet-100 text-violet-700 shrink-0">2</Badge>
                <p>Vous décrochez, vendez et marquez le lead comme "signé" avec le montant du devis.</p>
              </div>
              <div className="flex gap-3">
                <Badge className="bg-violet-100 text-violet-700 shrink-0">3</Badge>
                <p>Celexia prend <strong>10% HT du montant signé</strong> comme commission.</p>
              </div>
              <div className="flex gap-3">
                <Badge className="bg-violet-100 text-violet-700 shrink-0">4</Badge>
                <p>La facturation est mensuelle. Vous recevez un récap le 1er de chaque mois.</p>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Note : la commission ne s'applique que sur les leads générés par Celexia (source "Google Ads"), pas sur les leads "bouche à oreille".
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
