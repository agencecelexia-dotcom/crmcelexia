import { useState, useCallback, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProspects } from '../hooks/use-prospects'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useDebounce } from '@/hooks/use-debounce'
import { DEBOUNCE_MS } from '@/lib/constants'
import type { ProspectFilters, Prospect } from '@/types'
import type { ProspectStatus } from '@/types/enums'
import {
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUS_COLORS,
} from '@/types/enums'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { ProspectCallPanel } from '../components/prospect-call-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDate, formatPhone } from '@/lib/format'
import {
  Plus,
  Upload,
  Search,
  Phone,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  PhoneCall,
  AlertTriangle,
  Sparkles,
} from 'lucide-react'
import { exportToCsv } from '@/lib/export-csv'
import { ProspectGenerationModal } from '../components/prospect-generation-modal'

const STATUS_OPTIONS = Object.entries(PROSPECT_STATUS_LABELS) as [ProspectStatus, string][]

export function ProspectsListPage() {
  const { isFounder } = useAuth()
  const navigate = useNavigate()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, DEBOUNCE_MS)
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | 'all'>('all')
  const [cityFilter, setCityFilter] = useState('')
  const [professionFilter, setProfessionFilter] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [neverCalled, setNeverCalled] = useState(false)
  const [hasOverdue, setHasOverdue] = useState(false)
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDesc, setSortDesc] = useState(true)

  // Side panel state
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const [showGeneration, setShowGeneration] = useState(false)

  const debouncedCity = useDebounce(cityFilter, DEBOUNCE_MS)
  const debouncedProfession = useDebounce(professionFilter, DEBOUNCE_MS)

  const filters: ProspectFilters = {
    search: debouncedSearch || undefined,
    status: statusFilter !== 'all' ? [statusFilter] : undefined,
    city: debouncedCity ? [debouncedCity] : undefined,
    profession: debouncedProfession ? [debouncedProfession] : undefined,
    never_called: neverCalled || undefined,
    has_overdue_reminder: hasOverdue || undefined,
  }

  const { data, isLoading, isFetching } = useProspects({
    filters,
    page,
    sortBy,
    sortDesc,
  })

  const handleSort = useCallback((column: string) => {
    setSortBy((prev) => {
      if (prev === column) {
        setSortDesc((d) => !d)
        return column
      }
      setSortDesc(true)
      return column
    })
  }, [])

  const prospects = data?.data ?? []
  const totalPages = data?.totalPages ?? 1
  const totalCount = data?.count ?? 0

  // Keep the user on the same prospect after a call is logged
  // (query invalidation will refresh the data in place)
  function handleCallLogged() {
    // no-op: stay on the current prospect
  }

  // Close panel on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedProspect(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Update selected prospect when data refreshes
  useEffect(() => {
    if (selectedProspect && prospects.length > 0) {
      const updated = prospects.find((p) => p.id === selectedProspect.id)
      if (updated) setSelectedProspect(updated)
    }
  }, [prospects, selectedProspect?.id])

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Main List Area */}
      <div className={`flex-1 min-w-0 flex flex-col transition-all ${selectedProspect ? '' : ''}`}>
        {/* Header */}
        <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-2 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Prospects</h1>
              <p className="text-sm text-muted-foreground">
                {totalCount} prospect{totalCount !== 1 ? 's' : ''}
                {isFetching && !isLoading && ' (mise à jour...)'}
              </p>
            </div>
            <div className="flex gap-1.5 sm:gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowGeneration(true)}
              >
                <Sparkles className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Générer</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (prospects.length === 0) return
                  exportToCsv('prospects', prospects as unknown as Record<string, unknown>[], [
                    { key: 'company_name', label: 'Entreprise' },
                    { key: 'contact_name', label: 'Nom' },
                    { key: 'contact_firstname', label: 'Prénom' },
                    { key: 'phone', label: 'Téléphone' },
                    { key: 'email', label: 'Email' },
                    { key: 'profession', label: 'Métier' },
                    { key: 'city', label: 'Ville' },
                    { key: 'status', label: 'Statut' },
                    { key: 'call_count', label: 'Appels' },
                    { key: 'last_called_at', label: 'Dernier appel' },
                  ])
                }}
                disabled={prospects.length === 0}
              >
                <Download className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Export</span>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/prospects/import">
                  <Upload className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Import</span>
                </Link>
              </Button>
              <Button size="sm" onClick={() => navigate('/prospects/new')}>
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Nouveau</span>
              </Button>
            </div>
          </div>

          {/* Filters bar */}
          <div className="space-y-2 mt-3">
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[160px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="pl-9 h-9"
                />
              </div>

              <Select
                value={statusFilter}
                onValueChange={(v) => { setStatusFilter(v as ProspectStatus | 'all'); setPage(1) }}
              >
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Tous les statuts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  {STATUS_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant={showAdvanced ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setShowAdvanced((v) => !v)}
                className="gap-1 h-9"
              >
                <Filter className="h-4 w-4" />
                Filtres
              </Button>
            </div>

            {showAdvanced && (
              <div className="flex gap-2 flex-wrap items-center rounded-lg border bg-muted/30 p-2">
                <Input
                  placeholder="Ville..."
                  value={cityFilter}
                  onChange={(e) => { setCityFilter(e.target.value); setPage(1) }}
                  className="w-[140px] h-8 text-sm"
                />
                <Input
                  placeholder="Métier..."
                  value={professionFilter}
                  onChange={(e) => { setProfessionFilter(e.target.value); setPage(1) }}
                  className="w-[140px] h-8 text-sm"
                />
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={neverCalled}
                    onChange={(e) => { setNeverCalled(e.target.checked); setPage(1) }}
                    className="rounded border-input"
                  />
                  Jamais appelé
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasOverdue}
                    onChange={(e) => { setHasOverdue(e.target.checked); setPage(1) }}
                    className="rounded border-input"
                  />
                  Rappels en retard
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-3 sm:px-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('company_name')}
                  >
                    Entreprise {sortBy === 'company_name' && (sortDesc ? '↓' : '↑')}
                  </TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('profession')}
                  >
                    Métier {sortBy === 'profession' && (sortDesc ? '↓' : '↑')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('city')}
                  >
                    Ville {sortBy === 'city' && (sortDesc ? '↓' : '↑')}
                  </TableHead>
                  {isFounder && <TableHead>Commercial</TableHead>}
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => handleSort('call_count')}
                  >
                    Appels {sortBy === 'call_count' && (sortDesc ? '↓' : '↑')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('next_reminder_at')}
                  >
                    Rappel {sortBy === 'next_reminder_at' && (sortDesc ? '↓' : '↑')}
                  </TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: isFounder ? 9 : 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : prospects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isFounder ? 9 : 8}>
                      <EmptyState
                        icon={<Phone className="h-12 w-12" />}
                        title="Aucun prospect"
                        description="Importez un CSV ou créez votre premier prospect."
                        action={
                          <Button asChild>
                            <Link to="/prospects/import">Importer un CSV</Link>
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  prospects.map((prospect) => {
                    const isSelected = selectedProspect?.id === prospect.id
                    const hasOverdueReminder = prospect.next_reminder_at && new Date(prospect.next_reminder_at) < new Date()

                    return (
                      <TableRow
                        key={prospect.id}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-primary/5 border-l-2 border-l-primary'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedProspect(prospect)}
                      >
                        <TableCell className="font-medium">
                          {prospect.company_name}
                          {prospect.contact_name && (
                            <span className="block text-xs text-muted-foreground">
                              {prospect.contact_firstname} {prospect.contact_name}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <a
                            href={`tel:${prospect.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-sm text-primary hover:underline"
                          >
                            {formatPhone(prospect.phone)}
                          </a>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            label={PROSPECT_STATUS_LABELS[prospect.status]}
                            colorClass={PROSPECT_STATUS_COLORS[prospect.status]}
                          />
                        </TableCell>
                        <TableCell className="text-sm">{prospect.profession ?? '—'}</TableCell>
                        <TableCell className="text-sm">{prospect.city ?? '—'}</TableCell>
                        {isFounder && (
                          <TableCell className="text-sm">
                            {prospect.commercial?.full_name ?? '—'}
                          </TableCell>
                        )}
                        <TableCell className="text-right">{prospect.call_count}</TableCell>
                        <TableCell className="text-sm">
                          {prospect.next_reminder_at ? (
                            <span className={`flex items-center gap-1 ${hasOverdueReminder ? 'text-red-600 font-medium' : ''}`}>
                              {hasOverdueReminder && <AlertTriangle className="h-3 w-3" />}
                              {formatDate(prospect.next_reminder_at)}
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedProspect(prospect)}
                            className="p-1.5 rounded-md hover:bg-primary/10 text-primary"
                            title="Ouvrir le panneau d'appel"
                          >
                            <PhoneCall className="h-4 w-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 sm:px-4 py-2 shrink-0 border-t">
            <p className="text-sm text-muted-foreground">
              Page {page} sur {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
                Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || isLoading}
              >
                Suivant
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Side Panel */}
      {selectedProspect && (
        <div className="fixed inset-0 z-30 bg-background lg:relative lg:inset-auto lg:z-auto lg:w-[380px] shrink-0 animate-in slide-in-from-right-5 duration-200">
          <ProspectCallPanel
            key={selectedProspect.id}
            prospect={selectedProspect}
            onClose={() => setSelectedProspect(null)}
            onCallLogged={handleCallLogged}
          />
        </div>
      )}

      {/* Generation Modal */}
      <ProspectGenerationModal
        open={showGeneration}
        onOpenChange={setShowGeneration}
      />
    </div>
  )
}
