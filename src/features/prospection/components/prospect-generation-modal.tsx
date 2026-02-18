import { useState, useRef, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/use-auth'
import {
  generateProspects,
  deleteProspectsWithoutPhone,
  getNafCodes,
  NICHE_CATEGORIES,
  type GenerationProgress,
} from '../services/prospect-generation-service'
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
import { Loader2, CheckCircle2, XCircle, Phone, Trash2 } from 'lucide-react'

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
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  // Guard against double-start: track if an async generation is still in flight
  const generationInFlightRef = useRef(false)

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

    setIsRunning(true)
    setProgress(null)
    generationInFlightRef.current = true
    abortControllerRef.current = new AbortController()

    try {
      const inserted = await generateProspects(
        nicheName,
        nafCodes,
        quantity,
        profile.id,
        setProgress,
        abortControllerRef.current.signal,
      )
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
  }, [nicheName, nafCodes, quantity, profile, queryClient])

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

  const handleClose = useCallback(
    (value: boolean) => {
      if (isRunning) return
      setProgress(null)
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

          {/* Actions */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCleanup}
              disabled={isRunning || isCleaning}
              className="text-destructive hover:text-destructive"
            >
              {isCleaning ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Supprimer sans tél.
            </Button>

            <div className="flex gap-2">
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
                    Lancer la génération
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
