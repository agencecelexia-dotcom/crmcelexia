import { useState, useRef, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/use-auth'
import {
  generateProspects,
  deleteProspectsWithoutPhone,
  runDiagnostic,
  getNafCodes,
  NICHE_CATEGORIES,
  type GenerationProgress,
} from '../services/prospect-generation-service'
import { useTeamMembers } from '../hooks/use-prospects'
import { assignProspects as assignProspectsService } from '../services/prospect-service'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, CheckCircle2, XCircle, Phone, Trash2, Stethoscope, Users, UserPlus, Percent } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProspectGenerationModal({ open, onOpenChange }: Props) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const [categoryIndex, setCategoryIndex] = useState(0)
  const [subNicheIndex, setSubNicheIndex] = useState(-1) // -1 = "Tous"
  const [quantity, setQuantity] = useState(100)
  const [isRunning, setIsRunning] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const [isDiagnosing, setIsDiagnosing] = useState(false)
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  // Guard against double-start: track if an async generation is still in flight
  const generationInFlightRef = useRef(false)

  // Assignment
  const { data: members = [] } = useTeamMembers()
  const [assignMode, setAssignMode] = useState<'me' | 'single' | 'split'>('me')
  const [assignMember, setAssignMember] = useState('')
  const [splits, setSplits] = useState<{ commercial_id: string; percentage: number }[]>([])

  const totalPercent = splits.reduce((sum, s) => sum + s.percentage, 0)

  function addSplit() {
    const used = splits.map((s) => s.commercial_id)
    const available = members.find((m) => !used.includes(m.id))
    if (!available) return
    const remaining = 100 - totalPercent
    setSplits([...splits, { commercial_id: available.id, percentage: Math.max(remaining, 0) }])
  }

  const selectedCategory = NICHE_CATEGORIES[categoryIndex]

  const nicheName = useMemo(() => {
    if (subNicheIndex < 0) return selectedCategory.label
    const sub = selectedCategory.subNiches[subNicheIndex]
    return `${selectedCategory.label} > ${sub.label}`
  }, [selectedCategory, subNicheIndex])

  const nafCodes = useMemo(
    () => getNafCodes(categoryIndex, subNicheIndex),
    [categoryIndex, subNicheIndex],
  )

  const handleStart = useCallback(async () => {
    if (!profile) return
    if (generationInFlightRef.current) return // prevent double-start
    if (quantity < 1 || quantity > 5000) {
      toast.error('Le nombre doit être entre 1 et 5000')
      return
    }
    if (assignMode === 'single' && !assignMember) {
      toast.error('Sélectionnez un membre de l\'équipe')
      return
    }
    if (assignMode === 'split' && (splits.length === 0 || totalPercent !== 100)) {
      toast.error('La répartition doit totaliser 100%')
      return
    }

    // Determine who the prospects get generated under initially
    const generationOwnerId = assignMode === 'single' ? assignMember : profile.id

    setIsRunning(true)
    setProgress(null)
    generationInFlightRef.current = true
    abortControllerRef.current = new AbortController()

    try {
      const inserted = await generateProspects(
        nicheName,
        nafCodes,
        quantity,
        generationOwnerId,
        setProgress,
        abortControllerRef.current.signal,
      )

      // If split mode, reassign after generation
      if (assignMode === 'split' && inserted > 0) {
        setProgress((prev) => prev ? { ...prev, phase: 'collecting' } : prev)
        // Fetch the IDs of newly generated prospects
        const { data: newProspects } = await (await import('@/lib/supabase/client')).supabase
          .from('prospects')
          .select('id')
          .eq('commercial_id', generationOwnerId)
          .eq('source', 'api_generation')
          .eq('niche', nicheName)
          .eq('status', 'nouveau')
          .order('created_at', { ascending: false })
          .limit(inserted)

        if (newProspects && newProspects.length > 0) {
          const ids = newProspects.map((p) => p.id)
          // Distribute proportionally
          const shuffled = [...ids].sort(() => Math.random() - 0.5)
          let offset = 0
          for (const { commercial_id, percentage } of splits) {
            const count = Math.round((percentage / 100) * ids.length)
            const chunk = shuffled.slice(offset, offset + count)
            if (chunk.length > 0) {
              await assignProspectsService(chunk, commercial_id)
            }
            offset += count
          }
          // Remaining to last person
          if (offset < shuffled.length) {
            const remaining = shuffled.slice(offset)
            await assignProspectsService(remaining, splits[splits.length - 1].commercial_id)
          }
        }
      }

      toast.success(`${inserted} prospect${inserted !== 1 ? 's' : ''} généré${inserted !== 1 ? 's' : ''} !`)
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue'
      if (message !== 'Annulé') {
        setProgress((prev) =>
          prev
            ? { ...prev, phase: 'error', error: message }
            : {
                phase: 'error',
                collected: 0,
                enriched: 0,
                withPhone: 0,
                quantity,
                sireneExhausted: false,
                inserted: 0,
                error: message,
              },
        )
        toast.error(`Erreur: ${message}`)
      }
    } finally {
      generationInFlightRef.current = false
      setIsRunning(false)
      abortControllerRef.current = null
    }
  }, [nicheName, nafCodes, quantity, profile, queryClient, assignMode, assignMember, splits, totalPercent])

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort()
    // Don't set isRunning=false here — let the finally block handle it
    // to prevent race condition where user could start a new generation
    toast.info('Annulation en cours...')
  }, [])

  const handleCleanup = useCallback(async () => {
    setIsCleaning(true)
    try {
      const count = await deleteProspectsWithoutPhone()
      toast.success(`${count} prospect${count !== 1 ? 's' : ''} sans téléphone supprimé${count !== 1 ? 's' : ''}`)
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue'
      toast.error(`Erreur: ${message}`)
    } finally {
      setIsCleaning(false)
    }
  }, [queryClient])

  const handleDiagnostic = useCallback(async () => {
    setIsDiagnosing(true)
    setDiagnosticResult(null)
    try {
      const result = await runDiagnostic()
      setDiagnosticResult(result)
      const sireneOk = result.sirene?.status === 'OK'
      const mappyOk = result.mappy?.status === 'OK'
      const annuaireOk = result.annuaire?.status === 'OK'
      if (sireneOk && mappyOk && annuaireOk) {
        toast.success('Toutes les APIs fonctionnent correctement !')
      } else {
        const issues = []
        if (!sireneOk) issues.push(`SIRENE: ${result.sirene?.httpStatus || result.sirene?.message || 'KO'}`)
        if (!mappyOk) issues.push(`Mappy: ${result.mappy?.httpStatus || 'KO'}`)
        if (!annuaireOk) issues.push(`Annuaire: ${result.annuaire?.httpStatus || 'KO'}`)
        toast.error(`Problème(s) détecté(s): ${issues.join(', ')}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur'
      setDiagnosticResult({ error: message })
      toast.error(`Diagnostic impossible: ${message}`)
    } finally {
      setIsDiagnosing(false)
    }
  }, [])

  const handleClose = useCallback(
    (value: boolean) => {
      if (isRunning) return
      setProgress(null)
      setDiagnosticResult(null)
      onOpenChange(value)
    },
    [isRunning, onOpenChange],
  )

  // Progress based on phone leads found vs target
  const progressPercent = useMemo(() => {
    if (!progress || progress.quantity === 0) return 0
    if (progress.phase === 'done') return 100
    // Show collecting progress as 0-20%, enriching as 20-100%
    if (progress.phase === 'collecting' && progress.collected > 0) {
      return Math.min(Math.round((progress.collected / (progress.quantity * 3)) * 20), 20)
    }
    // Enriching: based on phone leads vs target (20-100%)
    return Math.min(
      20 + Math.round((progress.withPhone / progress.quantity) * 80),
      100,
    )
  }, [progress])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Générer des prospects</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Form */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="gen-category">Catégorie</Label>
              <Select
                value={String(categoryIndex)}
                onValueChange={(v) => {
                  setCategoryIndex(Number(v))
                  setSubNicheIndex(-1)
                }}
                disabled={isRunning}
              >
                <SelectTrigger id="gen-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NICHE_CATEGORIES.map((cat, i) => (
                    <SelectItem key={cat.label} value={String(i)}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gen-subniche">Sous-catégorie</Label>
              <Select
                value={String(subNicheIndex)}
                onValueChange={(v) => setSubNicheIndex(Number(v))}
                disabled={isRunning}
              >
                <SelectTrigger id="gen-subniche">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-1">
                    Tous les {selectedCategory.label.toLowerCase()}
                  </SelectItem>
                  {selectedCategory.subNiches.map((sub, i) => (
                    <SelectItem key={sub.label} value={String(i)}>
                      {sub.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gen-quantity">Nombre de prospects</Label>
              <Input
                id="gen-quantity"
                type="number"
                min={1}
                max={5000}
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, parseInt(e.target.value) || 1))
                }
                disabled={isRunning}
              />
              <p className="text-xs text-muted-foreground">
                Le système ne s'arrêtera pas tant qu'il n'aura pas trouvé {quantity} prospects avec téléphone.
              </p>
            </div>
          </div>

          {/* Assignment */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Attribution
            </Label>
            <div className="flex gap-1.5">
              <Button
                variant={assignMode === 'me' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAssignMode('me')}
                disabled={isRunning}
                className="flex-1 text-xs h-7"
              >
                Moi
              </Button>
              <Button
                variant={assignMode === 'single' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAssignMode('single')}
                disabled={isRunning}
                className="flex-1 text-xs h-7"
              >
                <UserPlus className="h-3 w-3 mr-1" />
                Membre
              </Button>
              <Button
                variant={assignMode === 'split' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setAssignMode('split'); if (splits.length === 0) addSplit() }}
                disabled={isRunning}
                className="flex-1 text-xs h-7"
              >
                <Percent className="h-3 w-3 mr-1" />
                Répartir
              </Button>
            </div>

            {assignMode === 'single' && (
              <Select value={assignMember} onValueChange={setAssignMember} disabled={isRunning}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Choisir un membre..." />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name} ({m.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {assignMode === 'split' && (
              <div className="space-y-2">
                {splits.map((split, i) => (
                  <div key={i} className="flex items-center gap-1.5 p-1.5 rounded border bg-muted/30">
                    <Select
                      value={split.commercial_id}
                      onValueChange={(v) => setSplits(splits.map((s, j) => j === i ? { ...s, commercial_id: v } : s))}
                      disabled={isRunning}
                    >
                      <SelectTrigger className="flex-1 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={split.percentage}
                      onChange={(e) => setSplits(splits.map((s, j) => j === i ? { ...s, percentage: parseInt(e.target.value) || 0 } : s))}
                      className="h-7 w-14 text-center text-xs"
                      disabled={isRunning}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-500"
                      onClick={() => setSplits(splits.filter((_, j) => j !== i))}
                      disabled={isRunning}
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addSplit} disabled={splits.length >= members.length || isRunning}>
                    + Ajouter
                  </Button>
                  <span className={`text-xs font-medium ${totalPercent === 100 ? 'text-green-600' : 'text-red-600'}`}>
                    Total : {totalPercent}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Progress */}
          {progress && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {progress.phase === 'collecting' && 'Collecte SIRENE...'}
                    {progress.phase === 'enriching' && 'Recherche de numéros...'}
                    {progress.phase === 'done' && 'Terminé !'}
                    {progress.phase === 'error' && 'Erreur'}
                  </span>
                  <span className="font-mono text-sm">
                    {progress.phase === 'done' || progress.phase === 'error'
                      ? ''
                      : `${progressPercent}%`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      progress.phase === 'error'
                        ? 'bg-destructive'
                        : progress.phase === 'done'
                          ? 'bg-green-500'
                          : 'bg-primary'
                    }`}
                    style={{
                      width: `${progress.phase === 'done' ? 100 : progressPercent}%`,
                    }}
                  />
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                {progress.phase === 'collecting' && (
                  <div className="col-span-2 flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span>
                      {progress.collected} leads collectés...
                    </span>
                  </div>
                )}

                {(progress.phase === 'enriching' ||
                  progress.phase === 'done') && (
                  <>
                    <div className="flex items-center gap-2">
                      <Loader2
                        className={`h-3.5 w-3.5 ${progress.phase === 'enriching' ? 'animate-spin text-primary' : 'text-green-500'}`}
                      />
                      <span>
                        {progress.enriched} enrichis
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-green-600" />
                      <span className="font-medium">
                        {progress.withPhone} / {progress.quantity} avec tél.
                      </span>
                    </div>
                  </>
                )}

                {progress.phase === 'done' && (
                  <div className="col-span-2 flex items-center gap-2 text-green-600 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      {progress.inserted} prospect
                      {progress.inserted !== 1 ? 's' : ''} inséré
                      {progress.inserted !== 1 ? 's' : ''} en base
                      {progress.sireneExhausted && progress.inserted < progress.quantity
                        ? ' (base SIRENE épuisée)'
                        : ''}
                    </span>
                  </div>
                )}

                {progress.phase === 'error' && (
                  <div className="col-span-2 flex items-center gap-2 text-destructive">
                    <XCircle className="h-4 w-4" />
                    <span className="text-xs">{progress.error}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Diagnostic result */}
          {diagnosticResult && (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1 font-mono overflow-auto max-h-48">
              <div className="font-semibold text-sm font-sans mb-2">Résultat diagnostic</div>
              {diagnosticResult.error ? (
                <div className="text-destructive">{diagnosticResult.error}</div>
              ) : (
                <>
                  <div className={diagnosticResult.sirene?.status === 'OK' ? 'text-green-600' : 'text-destructive'}>
                    SIRENE: {diagnosticResult.sirene?.status} {diagnosticResult.sirene?.httpStatus ? `(HTTP ${diagnosticResult.sirene.httpStatus})` : ''}
                    {diagnosticResult.sirene?.body && diagnosticResult.sirene.status !== 'OK' && (
                      <div className="ml-4 text-muted-foreground break-all">{diagnosticResult.sirene.body}</div>
                    )}
                  </div>
                  <div className={diagnosticResult.mappy?.status === 'OK' ? 'text-green-600' : 'text-destructive'}>
                    Mappy: {diagnosticResult.mappy?.status} {diagnosticResult.mappy?.httpStatus ? `(HTTP ${diagnosticResult.mappy.httpStatus})` : ''}
                  </div>
                  <div className={diagnosticResult.annuaire?.status === 'OK' ? 'text-green-600' : 'text-destructive'}>
                    Annuaire: {diagnosticResult.annuaire?.status} {diagnosticResult.annuaire?.httpStatus ? `(HTTP ${diagnosticResult.annuaire.httpStatus})` : ''}
                  </div>
                  <div className="text-muted-foreground mt-1">
                    Clé SIRENE: {diagnosticResult.env?.SIRENE_API_KEY_value || 'N/A'}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCleanup}
                disabled={isRunning || isCleaning}
                className="text-destructive hover:text-destructive flex-1 sm:flex-none"
              >
                {isCleaning ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                <span className="truncate">Sans tél.</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDiagnostic}
                disabled={isRunning || isDiagnosing}
                className="flex-1 sm:flex-none"
              >
                {isDiagnosing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Stethoscope className="mr-1.5 h-3.5 w-3.5" />
                )}
                Diagnostic
              </Button>
            </div>

            <div className="flex gap-2 justify-end">
              {isRunning ? (
                <Button variant="destructive" size="sm" onClick={handleCancel}>
                  Annuler
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleClose(false)}
                  >
                    Fermer
                  </Button>
                  <Button size="sm" onClick={handleStart}>
                    Lancer
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
