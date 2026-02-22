import { useState, useCallback, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProspects, useDeleteProspects } from '../hooks/use-prospects'
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
import { AssignModal } from '../components/assign-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  Trash2,
  Users,
  ChevronsDown,
  X,
  Calendar,
} from 'lucide-react'
import { exportToCsv } from '@/lib/export-csv'
import { ProspectGenerationModal } from '../components/prospect-generation-modal'
import { toast } from 'sonner'

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
  const [hasReminderToday, setHasReminderToday] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [lastCalledFrom, setLastCalledFrom] = useState('')
  const [lastCalledTo, setLastCalledTo] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDesc, setSortDesc] = useState(true)

  // Side panel state
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const [showGeneration, setShowGeneration] = useState(false)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showAssignModal, setShowAssignModal] = useState(false)

  const deleteProspects = useDeleteProspects()

  const debouncedCity = useDebounce(cityFilter, DEBOUNCE_MS)
  const debouncedProfession = useDebounce(professionFilter, DEBOUNCE_MS)

  const filters: ProspectFilters = {
    search: debouncedSearch || undefined,
    status: statusFilter !== 'all' ? [statusFilter] : undefined,
    city: debouncedCity ? [debouncedCity] : undefined,
    profession: debouncedProfession ? [debouncedProfession] : undefined,
    never_called: neverCalled || undefined,
    has_overdue_reminder: hasOverdue || undefined,
    has_reminder_today: hasReminderToday || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    last_called_from: lastCalledFrom || undefined,
    last_called_to: lastCalledTo || undefined,
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

  // Active filter count for badge
  const activeFilterCount = useMemo(() => {
    let c = 0
    if (statusFilter !== 'all') c++
    if (cityFilter) c++
    if (professionFilter) c++
    if (neverCalled) c++
    if (hasOverdue) c++
    if (hasReminderToday) c++
    if (dateFrom) c++
    if (dateTo) c++
    if (lastCalledFrom) c++
    if (lastCalledTo) c++
    return c
  }, [statusFilter, cityFilter, professionFilter, neverCalled, hasOverdue, hasReminderToday, dateFrom, dateTo, lastCalledFrom, lastCalledTo])

  // Clear selection when page/filters change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [page, debouncedSearch, statusFilter, debouncedCity, debouncedProfession, neverCalled, hasOverdue])

  // Selection helpers
  const allOnPageSelected = prospects.length > 0 && prospects.every((p) => selectedIds.has(p.id))
  const someSelected = selectedIds.size > 0

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(prospects.map((p) => p.id)))
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function selectFromHere(index: number) {
    const idsFromIndex = prospects.slice(index).map((p) => p.id)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of idsFromIndex) next.add(id)
      return next
    })
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return
    const count = selectedIds.size
    const confirmed = window.confirm(`Supprimer ${count} prospect${count > 1 ? 's' : ''} ? Cette action est irréversible.`)
    if (!confirmed) return
    try {
      await deleteProspects.mutateAsync(Array.from(selectedIds))
      setSelectedIds(new Set())
    } catch {
      // Error handled by hook
    }
  }

  function clearAllFilters() {
    setStatusFilter('all')
    setCityFilter('')
    setProfessionFilter('')
    setNeverCalled(false)
    setHasOverdue(false)
    setHasReminderToday(false)
    setDateFrom('')
    setDateTo('')
    setLastCalledFrom('')
    setLastCalledTo('')
    setPage(1)
  }

  // Keep the user on the same prospect after a call is logged
  function handleCallLogged() {
    // no-op: stay on the current prospect
  }

  // Close panel on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (someSelected) {
          setSelectedIds(new Set())
        } else {
          setSelectedProspect(null)
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [someSelected])

  // Update selected prospect when data refreshes
  useEffect(() => {
    if (selectedProspect && prospects.length > 0) {
      const updated = prospects.find((p) => p.id === selectedProspect.id)
      if (updated) setSelectedProspect(updated)
    }
  }, [prospects, selectedProspect?.id])

  const colCount = (isFounder ? 10 : 9) + 1 // +1 for checkbox column

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
                {someSelected && ` · ${selectedIds.size} sélectionné${selectedIds.size > 1 ? 's' : ''}`}
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
                {activeFilterCount > 0 && (
                  <span className="ml-1 bg-primary text-primary-foreground rounded-full h-5 w-5 text-xs flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>

              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="h-9 text-muted-foreground"
                >
                  <X className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              )}
            </div>

            {showAdvanced && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex gap-2 flex-wrap items-center">
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
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasReminderToday}
                      onChange={(e) => { setHasReminderToday(e.target.checked); setPage(1) }}
                      className="rounded border-input"
                    />
                    Rappels aujourd'hui
                  </label>
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Créé</span>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
                      className="w-[130px] h-7 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
                      className="w-[130px] h-7 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Dernier appel</span>
                    <Input
                      type="date"
                      value={lastCalledFrom}
                      onChange={(e) => { setLastCalledFrom(e.target.value); setPage(1) }}
                      className="w-[130px] h-7 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <Input
                      type="date"
                      value={lastCalledTo}
                      onChange={(e) => { setLastCalledTo(e.target.value); setPage(1) }}
                      className="w-[130px] h-7 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {someSelected && (
          <div className="mx-3 sm:mx-4 mb-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 shrink-0 animate-in slide-in-from-top-2 duration-150">
            <span className="text-sm font-medium">
              {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAssignModal(true)}
              className="gap-1"
            >
              <Users className="h-4 w-4" />
              Attribuer
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={deleteProspects.isPending}
              className="gap-1"
            >
              <Trash2 className="h-4 w-4" />
              {deleteProspects.isPending ? 'Suppression...' : 'Supprimer'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto px-3 sm:px-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allOnPageSelected && prospects.length > 0}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Tout sélectionner"
                    />
                  </TableHead>
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
                      {Array.from({ length: colCount }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : prospects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={colCount}>
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
                  prospects.map((prospect, index) => {
                    const isPanelSelected = selectedProspect?.id === prospect.id
                    const isChecked = selectedIds.has(prospect.id)
                    const hasOverdueReminder = prospect.next_reminder_at && new Date(prospect.next_reminder_at) < new Date()

                    return (
                      <TableRow
                        key={prospect.id}
                        className={`cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-primary/10'
                            : isPanelSelected
                            ? 'bg-primary/5 border-l-2 border-l-primary'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedProspect(prospect)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()} className="pr-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <div className="flex items-center">
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() => toggleSelect(prospect.id)}
                                  aria-label={`Sélectionner ${prospect.company_name}`}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-56">
                              <DropdownMenuItem onClick={() => toggleSelect(prospect.id)}>
                                {isChecked ? 'Désélectionner' : 'Sélectionner'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => selectFromHere(index)}>
                                <ChevronsDown className="h-4 w-4 mr-2" />
                                Tout sélectionner en dessous ({prospects.length - index})
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={toggleSelectAll}>
                                Tout sélectionner sur la page ({prospects.length})
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
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

      {/* Assign Modal */}
      <AssignModal
        open={showAssignModal}
        onOpenChange={setShowAssignModal}
        selectedIds={Array.from(selectedIds)}
        onDone={() => setSelectedIds(new Set())}
      />
    </div>
  )
}
