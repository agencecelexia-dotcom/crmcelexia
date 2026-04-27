import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useProspects, useDeleteProspects, useTeamMembers, useAssignProspects } from '../hooks/use-prospects'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useDebounce } from '@/hooks/use-debounce'
import { DEBOUNCE_MS } from '@/lib/constants'
import type { ProspectFilters, Prospect } from '@/types'
import type { ProspectStatus } from '@/types/enums'
import {
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUS_COLORS,
  PROSPECT_STATUS_ROW_COLORS,
  PROFESSION_CATEGORIES,
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_STATUS_COLORS,
  type OpportunityStatus,
  type ProfessionCategory,
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
import { toast } from 'sonner'
import { ProspectGenerationModal } from '../components/prospect-generation-modal'


const STATUS_OPTIONS = Object.entries(PROSPECT_STATUS_LABELS) as [ProspectStatus, string][]

export function ProspectsListPage() {
  const { isFounder, profile } = useAuth()
  const navigate = useNavigate()

  // Persist filters in URL so they survive back-navigation
  const [searchParams, setSearchParams] = useSearchParams()

  // Persist filters dans sessionStorage : si on revient sur /prospects sans query string
  // (ex : clic sidebar), on restaure les derniers filtres utilisés.
  // IMPORTANT : ne restaure qu'au mount initial. Sinon dès que l'utilisateur clear
  // un filtre (URL temporairement vide), sessionStorage écraserait son action.
  const STORAGE_KEY = 'prospects-list-filters-v1'
  const restoredRef = useRef(false)
  useEffect(() => {
    if (!restoredRef.current) {
      restoredRef.current = true
      if (searchParams.toString() === '') {
        const saved = sessionStorage.getItem(STORAGE_KEY)
        if (saved && saved !== '') {
          setSearchParams(new URLSearchParams(saved), { replace: true })
          return
        }
      }
    }
    sessionStorage.setItem(STORAGE_KEY, searchParams.toString())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Helper: read a param with fallback
  const sp = (key: string, fallback = '') => searchParams.get(key) || fallback

  // Helper: update one or more params at once (replaces history entry)
  const updateParams = useCallback((updates: Record<string, string | null>, resetPage = true) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === '' || v === 'all' || v === 'false') next.delete(k)
        else next.set(k, v)
      }
      if (resetPage && !('p' in updates)) next.delete('p')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const page = Number(sp('p', '1'))
  const setPage = useCallback((p: number) => updateParams({ p: p > 1 ? String(p) : null }, false), [updateParams])

  const [search, setSearch] = useState(sp('q'))
  const debouncedSearch = useDebounce(search, DEBOUNCE_MS)
  // Sync debounced search → URL (skip initial empty → empty)
  const searchSynced = useMemo(() => sp('q'), [searchParams])
  useEffect(() => {
    if (debouncedSearch !== searchSynced) {
      updateParams({ q: debouncedSearch || null })
    }
  }, [debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps
  // Sync URL → search (when URL changes via sessionStorage restore or back-nav)
  useEffect(() => {
    if (searchSynced !== search) setSearch(searchSynced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchSynced])

  const statusFilter = (sp('status') || 'all') as ProspectStatus | 'all'
  const setStatusFilter = useCallback((v: ProspectStatus | 'all') => updateParams({ status: v }), [updateParams])

  const cityFilter = sp('city')
  const setCityFilter = useCallback((v: string) => updateParams({ city: v || null }), [updateParams])

  // Filtre métier : catégorie canonique (paysagiste, pisciniste, ...) qui mappe vers
  // une liste de patterns ilike envoyée au service. Voir PROFESSION_CATEGORIES.
  const professionCategory = sp('profession') as ProfessionCategory | ''
  const setProfessionCategory = useCallback((v: string) => updateParams({ profession: v || null }), [updateParams])
  const professionPatterns: string[] | undefined = professionCategory && professionCategory in PROFESSION_CATEGORIES
    ? [...PROFESSION_CATEGORIES[professionCategory as ProfessionCategory].patterns]
    : undefined

  const [showAdvanced, setShowAdvanced] = useState(false)
  const neverCalled = sp('nc') === 'true'
  const setNeverCalled = useCallback((v: boolean) => updateParams({ nc: v ? 'true' : null }), [updateParams])
  const hasOverdue = sp('od') === 'true'
  const setHasOverdue = useCallback((v: boolean) => updateParams({ od: v ? 'true' : null }), [updateParams])
  const hasReminderToday = sp('rt') === 'true'
  const setHasReminderToday = useCallback((v: boolean) => updateParams({ rt: v ? 'true' : null }), [updateParams])

  const dateFrom = sp('df')
  const setDateFrom = useCallback((v: string) => updateParams({ df: v || null }), [updateParams])
  const dateTo = sp('dt')
  const setDateTo = useCallback((v: string) => updateParams({ dt: v || null }), [updateParams])
  const lastCalledFrom = sp('lcf')
  const setLastCalledFrom = useCallback((v: string) => updateParams({ lcf: v || null }), [updateParams])
  const lastCalledTo = sp('lct')
  const setLastCalledTo = useCallback((v: string) => updateParams({ lct: v || null }), [updateParams])

  // phonePrefixes : dérivé de l'URL (param 'pp', CSV) pour persister via sessionStorage
  const ppParam = sp('pp')
  const phonePrefixes = useMemo(() => (ppParam ? ppParam.split(',') : []), [ppParam])
  const setPhonePrefixes = useCallback((next: string[] | ((prev: string[]) => string[])) => {
    const value = typeof next === 'function' ? next(phonePrefixes) : next
    updateParams({ pp: value.length > 0 ? value.join(',') : null })
  }, [updateParams, phonePrefixes])
  const [phonePrefixInput, setPhonePrefixInput] = useState('')

  const commercialFilter = sp('com') || 'all'
  const setCommercialFilter = useCallback((v: string) => updateParams({ com: v }), [updateParams])

  const sortBy = sp('sb', 'created_at')
  const setSortBy = useCallback((v: string | ((prev: string) => string)) => {
    if (typeof v === 'function') {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.set('sb', v(next.get('sb') || 'created_at'))
        return next
      }, { replace: true })
    } else {
      updateParams({ sb: v }, false)
    }
  }, [updateParams, setSearchParams])
  const sortDesc = sp('sd', 'true') === 'true'
  const setSortDesc = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    if (typeof v === 'function') {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.set('sd', String(v((next.get('sd') ?? 'true') === 'true')))
        return next
      }, { replace: true })
    } else {
      updateParams({ sd: String(v) }, false)
    }
  }, [updateParams, setSearchParams])

  // Side panel state
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const [showGeneration, setShowGeneration] = useState(false)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showAssignModal, setShowAssignModal] = useState(false)

  const deleteProspects = useDeleteProspects()
  const reassignProspect = useAssignProspects()
  const { data: teamMembers } = useTeamMembers()

  const filters: ProspectFilters = {
    search: debouncedSearch || undefined,
    status: statusFilter !== 'all' ? [statusFilter] : undefined,
    city: cityFilter ? [cityFilter] : undefined,
    profession: professionPatterns,
    commercial_id: commercialFilter !== 'all' ? commercialFilter : undefined,
    never_called: neverCalled || undefined,
    has_overdue_reminder: hasOverdue || undefined,
    has_reminder_today: hasReminderToday || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    last_called_from: lastCalledFrom || undefined,
    last_called_to: lastCalledTo || undefined,
    phone_prefixes: phonePrefixes.length > 0 ? phonePrefixes : undefined,
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
    if (commercialFilter !== 'all') c++
    if (cityFilter) c++
    if (professionCategory) c++
    if (neverCalled) c++
    if (hasOverdue) c++
    if (hasReminderToday) c++
    if (dateFrom) c++
    if (dateTo) c++
    if (lastCalledFrom) c++
    if (lastCalledTo) c++
    if (phonePrefixes.length > 0) c++
    return c
  }, [statusFilter, commercialFilter, cityFilter, professionCategory, neverCalled, hasOverdue, hasReminderToday, dateFrom, dateTo, lastCalledFrom, lastCalledTo, phonePrefixes])

  // Clear selection when page/filters change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [page, debouncedSearch, statusFilter, commercialFilter, cityFilter, professionCategory, neverCalled, hasOverdue])

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
    setSearchParams({}, { replace: true })
    setSearch('')
    setPhonePrefixes([])
    setPhonePrefixInput('')
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
                  onChange={(e) => { setSearch(e.target.value) }}
                  className="pl-9 h-9"
                />
              </div>

              <Select
                value={statusFilter}
                onValueChange={(v) => { setStatusFilter(v as ProspectStatus | 'all') }}
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

              {isFounder && (
                <Select
                  value={commercialFilter}
                  onValueChange={(v) => { setCommercialFilter(v) }}
                >
                  <SelectTrigger className="w-[180px] h-9">
                    <Users className="h-4 w-4 mr-1.5 text-muted-foreground" />
                    <SelectValue placeholder="Tous les commerciaux" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les commerciaux</SelectItem>
                    {profile && <SelectItem value={profile.id}>Mes prospects</SelectItem>}
                    {teamMembers
                      ?.filter((m) => m.id !== profile?.id)
                      .map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.full_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}

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
                    onChange={(e) => { setCityFilter(e.target.value) }}
                    className="w-[140px] h-8 text-sm"
                  />
                  <Select value={professionCategory || 'all'} onValueChange={(v) => { setProfessionCategory(v === 'all' ? '' : v) }}>
                    <SelectTrigger className="w-[180px] h-8 text-sm">
                      <SelectValue placeholder="Métier..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      <SelectItem value="all">Tous les métiers</SelectItem>
                      {Object.entries(PROFESSION_CATEGORIES).map(([key, { label }]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={neverCalled}
                      onChange={(e) => { setNeverCalled(e.target.checked) }}
                      className="rounded border-input"
                    />
                    Jamais appelé
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasOverdue}
                      onChange={(e) => { setHasOverdue(e.target.checked) }}
                      className="rounded border-input"
                    />
                    Rappels en retard
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasReminderToday}
                      onChange={(e) => { setHasReminderToday(e.target.checked) }}
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
                      onChange={(e) => { setDateFrom(e.target.value) }}
                      className="w-[130px] h-7 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => { setDateTo(e.target.value) }}
                      className="w-[130px] h-7 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Dernier appel</span>
                    <Input
                      type="date"
                      value={lastCalledFrom}
                      onChange={(e) => { setLastCalledFrom(e.target.value) }}
                      className="w-[130px] h-7 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <Input
                      type="date"
                      value={lastCalledTo}
                      onChange={(e) => { setLastCalledTo(e.target.value) }}
                      className="w-[130px] h-7 text-xs"
                    />
                  </div>
                </div>
                {/* Phone prefix filter */}
                <div className="flex items-center gap-2 flex-wrap">
                  <PhoneCall className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Préfixe tél.</span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {phonePrefixes.map((prefix) => (
                      <span
                        key={prefix}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium"
                      >
                        {prefix}
                        <button
                          onClick={() => { setPhonePrefixes((p) => p.filter((x) => x !== prefix)) }}
                          className="hover:text-destructive"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <Input
                      placeholder="ex: 06, 07..."
                      value={phonePrefixInput}
                      onChange={(e) => setPhonePrefixInput(e.target.value.replace(/[^0-9+ ]/g, ''))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault()
                          const val = phonePrefixInput.trim().replace(/\s/g, '')
                          if (val && !phonePrefixes.includes(val)) {
                            setPhonePrefixes((p) => [...p, val])
                            setPhonePrefixInput('')
                            setPage(1)
                          }
                        }
                      }}
                      className="w-[100px] h-7 text-xs"
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
                            : `${PROSPECT_STATUS_ROW_COLORS[prospect.status]} hover:bg-muted/50`
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
                          {(() => {
                            const activeOpp = prospect.opportunities?.find(o => !o.deleted_at)
                            if (activeOpp) {
                              const oppStatus = activeOpp.status as OpportunityStatus
                              return (
                                <StatusBadge
                                  label={OPPORTUNITY_STATUS_LABELS[oppStatus] ?? activeOpp.status}
                                  colorClass={OPPORTUNITY_STATUS_COLORS[oppStatus] ?? 'bg-gray-100 text-gray-800'}
                                />
                              )
                            }
                            return (
                              <StatusBadge
                                label={PROSPECT_STATUS_LABELS[prospect.status]}
                                colorClass={PROSPECT_STATUS_COLORS[prospect.status]}
                              />
                            )
                          })()}
                        </TableCell>
                        <TableCell className="text-sm">{prospect.profession ?? '—'}</TableCell>
                        <TableCell className="text-sm">{prospect.city ?? '—'}</TableCell>
                        {isFounder && (
                          <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  className="flex items-center gap-1 text-left hover:underline hover:text-primary transition-colors"
                                  title="Réassigner"
                                >
                                  <span className="truncate max-w-[120px]">{prospect.commercial?.full_name ?? '—'}</span>
                                  <Users className="h-3 w-3 shrink-0 text-muted-foreground" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-48">
                                {teamMembers
                                  ?.filter((m) => m.id !== prospect.commercial_id)
                                  .map((member) => (
                                    <DropdownMenuItem
                                      key={member.id}
                                      onClick={() => {
                                        reassignProspect.mutate(
                                          { ids: [prospect.id], commercialId: member.id },
                                          {
                                            onSuccess: () => toast.success(`${prospect.company_name} reassigne a ${member.full_name}`),
                                            onError: () => toast.error('Erreur lors de la reassignation'),
                                          },
                                        )
                                      }}
                                    >
                                      {member.full_name}
                                    </DropdownMenuItem>
                                  ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
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
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
                Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
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
