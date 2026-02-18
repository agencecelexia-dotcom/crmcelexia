import { useState, useMemo } from 'react'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { RefreshCcw, Calendar, Clock, ArrowRight, Users } from 'lucide-react'
import { formatDateShort } from '@/lib/format'
import { type ClientStatus } from '@/types/enums'

interface FollowupClient {
  id: string
  company_name: string
  contact_name: string | null
  phone: string
  status: ClientStatus
  commercial_name: string
  converted_at: string
  last_project_end: string | null
  months_since_conversion: number
  followup_category: '6_mois' | '1_an' | '2_ans' | 'recent'
}

async function getFollowupClients(commercialId?: string): Promise<FollowupClient[]> {
  let query = supabase
    .from('clients')
    .select('*, commercial:profiles!clients_commercial_id_fkey(full_name)')
    .is('deleted_at', null)
    .order('converted_at', { ascending: true })

  if (commercialId) {
    query = query.eq('commercial_id', commercialId)
  }

  const { data: clients, error } = await query
  if (error) throw error

  const now = new Date()

  return ((clients ?? []) as unknown as {
    id: string
    company_name: string
    contact_name: string | null
    phone: string
    status: ClientStatus
    converted_at: string
    commercial: { full_name: string }
  }[]).map(c => {
    const convertedDate = new Date(c.converted_at)
    const monthsDiff = (now.getFullYear() - convertedDate.getFullYear()) * 12 + (now.getMonth() - convertedDate.getMonth())

    let category: FollowupClient['followup_category'] = 'recent'
    if (monthsDiff >= 24) category = '2_ans'
    else if (monthsDiff >= 12) category = '1_an'
    else if (monthsDiff >= 6) category = '6_mois'

    return {
      id: c.id,
      company_name: c.company_name,
      contact_name: c.contact_name,
      phone: c.phone,
      status: c.status,
      commercial_name: c.commercial?.full_name ?? '—',
      converted_at: c.converted_at,
      last_project_end: null,
      months_since_conversion: monthsDiff,
      followup_category: category,
    }
  })
}

export function FollowupPage() {
  const { profile, isFounder } = useAuth()
  const navigate = useNavigate()
  const commercialId = isFounder ? undefined : profile?.id
  const [filter, setFilter] = useState<string>('all')

  const { data: clients, isLoading } = useQuery({
    queryKey: ['followup', 'clients', commercialId],
    queryFn: () => getFollowupClients(commercialId),
    staleTime: 60000,
  })

  const filteredClients = useMemo(() => {
    if (!clients) return []
    if (filter === 'all') return clients.filter(c => c.followup_category !== 'recent')
    return clients.filter(c => c.followup_category === filter)
  }, [clients, filter])

  const counts = useMemo(() => {
    if (!clients) return { '6_mois': 0, '1_an': 0, '2_ans': 0 }
    return {
      '6_mois': clients.filter(c => c.followup_category === '6_mois').length,
      '1_an': clients.filter(c => c.followup_category === '1_an').length,
      '2_ans': clients.filter(c => c.followup_category === '2_ans').length,
    }
  }, [clients])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Suivi Long Terme</h1>
        <p className="text-muted-foreground">
          Clients à relancer et opportunités dormantes
        </p>
      </div>

      {/* Category cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card
          className={`cursor-pointer transition-colors ${filter === '6_mois' ? 'border-primary bg-primary/5' : 'hover:bg-accent/30'}`}
          onClick={() => setFilter(f => f === '6_mois' ? 'all' : '6_mois')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{counts['6_mois']}</p>
                <p className="text-sm text-muted-foreground">Relance 6 mois</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${filter === '1_an' ? 'border-primary bg-primary/5' : 'hover:bg-accent/30'}`}
          onClick={() => setFilter(f => f === '1_an' ? 'all' : '1_an')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <RefreshCcw className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{counts['1_an']}</p>
                <p className="text-sm text-muted-foreground">Relance 1 an</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${filter === '2_ans' ? 'border-primary bg-primary/5' : 'hover:bg-accent/30'}`}
          onClick={() => setFilter(f => f === '2_ans' ? 'all' : '2_ans')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{counts['2_ans']}</p>
                <p className="text-sm text-muted-foreground">Relance 2 ans+</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clients to follow up */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Clients à relancer ({filteredClients.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              Aucun client à relancer dans cette catégorie
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entreprise</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Commercial</TableHead>
                  <TableHead>Converti le</TableHead>
                  <TableHead>Ancienneté</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id} className="cursor-pointer hover:bg-accent/50">
                    <TableCell className="font-medium">{client.company_name}</TableCell>
                    <TableCell>{client.contact_name ?? '—'}</TableCell>
                    <TableCell className="font-mono text-sm">{client.phone}</TableCell>
                    <TableCell>{client.commercial_name}</TableCell>
                    <TableCell>{formatDateShort(client.converted_at)}</TableCell>
                    <TableCell>{client.months_since_conversion} mois</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {client.followup_category === '6_mois' ? '6 mois' : client.followup_category === '1_an' ? '1 an' : '2 ans+'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-xs ${client.status === 'actif' ? 'bg-green-100 text-green-800' : client.status === 'resilie' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}
                      >
                        {client.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/clients/${client.id}`)}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
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
