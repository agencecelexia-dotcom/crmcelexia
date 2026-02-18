import { useState, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/use-auth'
import {
  generateProspects,
  AVAILABLE_NICHES,
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
import { Loader2, CheckCircle2, XCircle, Phone, PhoneOff } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProspectGenerationModal({ open, onOpenChange }: Props) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const [niche, setNiche] = useState(AVAILABLE_NICHES[0])
  const [quantity, setQuantity] = useState(100)
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const handleStart = useCallback(async () => {
    if (!profile) return
    if (quantity < 1 || quantity > 5000) {
      toast.error('Le nombre doit être entre 1 et 5000')
      return
    }

    setIsRunning(true)
    setProgress(null)
    abortControllerRef.current = new AbortController()

    try {
      const inserted = await generateProspects(
        niche,
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
                collectTotal: 0,
                enriched: 0,
                enrichTotal: 0,
                withPhone: 0,
                withoutPhone: 0,
                inserted: 0,
                error: message,
              },
        )
        toast.error(`Erreur: ${message}`)
      }
    } finally {
      setIsRunning(false)
      abortControllerRef.current = null
    }
  }, [niche, quantity, profile, queryClient])

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsRunning(false)
    toast.info('Génération annulée')
  }, [])

  const handleClose = useCallback(
    (value: boolean) => {
      if (isRunning) return
      setProgress(null)
      onOpenChange(value)
    },
    [isRunning, onOpenChange],
  )

  const progressPercent =
    progress && progress.enrichTotal > 0
      ? Math.round((progress.enriched / progress.enrichTotal) * 100)
      : progress?.phase === 'collecting' && progress.collectTotal > 0
        ? Math.round(
            (progress.collected / progress.collectTotal) * 50,
          )
        : 0

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
              <Label htmlFor="gen-niche">Niche</Label>
              <Select
                value={niche}
                onValueChange={setNiche}
                disabled={isRunning}
              >
                <SelectTrigger id="gen-niche">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_NICHES.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
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
                  setQuantity(parseInt(e.target.value) || 0)
                }
                disabled={isRunning}
              />
              <p className="text-xs text-muted-foreground">
                Le système collectera ~{quantity * 3} leads bruts pour en
                extraire les meilleurs.
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
                    {progress.phase === 'enriching' && 'Enrichissement...'}
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
                      {progress.collected} / {progress.collectTotal} leads
                      collectés
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
                        {progress.enriched} / {progress.enrichTotal} enrichis
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-green-600" />
                      <span>{progress.withPhone} avec téléphone</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <PhoneOff className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{progress.withoutPhone} sans téléphone</span>
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
          <div className="flex justify-end gap-2">
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
      </DialogContent>
    </Dialog>
  )
}
