import { useState, useCallback, useMemo, useRef, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import {
  parseLsaCsv,
  buildPortalLeadFromLsaRow,
  type LsaRow,
} from '../lib/parse-lsa-csv'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  clientId: string
  clientName: string
}

type Phase = 'pick' | 'preview' | 'importing' | 'done'

interface PreviewState {
  rows: LsaRow[]
  skipped: Array<{ line: number; reason: string }>
  errors: string[]
}

interface DoneState {
  inserted: number
  duplicates: number
  skipped: number
}

export function ImportLsaLeadsDialog({ open, onOpenChange, clientId, clientName }: Props) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('pick')
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [done, setDone] = useState<DoneState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const reset = useCallback(() => {
    setPhase('pick')
    setPreview(null)
    setDone(null)
    setError(null)
  }, [])

  const handleClose = useCallback(
    (v: boolean) => {
      if (!v) reset()
      onOpenChange(v)
    },
    [onOpenChange, reset],
  )

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setError(`Le fichier doit être au format CSV (.csv). Reçu : ${file.name}`)
      return
    }
    try {
      const text = await file.text()
      const result = parseLsaCsv(text)
      if (result.rows.length === 0) {
        setError(
          `Aucun lead exploitable trouvé. ${result.skipped.length} ligne(s) ignorée(s) (téléphone manquant).`,
        )
        return
      }
      setPreview({
        rows: result.rows,
        skipped: result.skipped,
        errors: result.errors,
      })
      setPhase('preview')
    } catch (e) {
      setError(`Erreur lecture fichier : ${(e as Error).message}`)
    }
  }, [])

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const f = e.dataTransfer.files[0]
      if (f) handleFile(f)
    },
    [handleFile],
  )

  const onImport = useCallback(async () => {
    if (!preview) return
    setPhase('importing')
    setError(null)

    try {
      // 1. Fetch existing phones for this client → dedup avant insert
      const { data: existing, error: fetchErr } = await supabase
        .from('portal_leads')
        .select('phone')
        .eq('client_id', clientId)
        .is('deleted_at', null)
      if (fetchErr) throw fetchErr
      const existingPhones = new Set((existing ?? []).map(r => r.phone.replace(/\D/g, '')))

      // 2. Filtre rows déjà en DB
      const toInsert = preview.rows
        .filter(r => !existingPhones.has(r.phone))
        .map(r => buildPortalLeadFromLsaRow(r, clientId))
      const duplicates = preview.rows.length - toInsert.length

      // 3. Batch insert (1 round-trip). Le trigger trg_portal_lead_created_event
      //    (migration 00085) crée l'event timeline pour chaque ligne.
      let inserted = 0
      if (toInsert.length > 0) {
        const { error: insertErr } = await supabase
          .from('portal_leads')
          .insert(toInsert)
        if (insertErr) throw insertErr
        inserted = toInsert.length
      }

      // 4. Invalidate caches React Query du portail de cet artisan
      qc.invalidateQueries({ queryKey: ['portal-leads', clientId] })
      qc.invalidateQueries({ queryKey: ['portal-lead-stats', clientId] })

      setDone({
        inserted,
        duplicates,
        skipped: preview.skipped.length,
      })
      setPhase('done')
    } catch (e) {
      setError(`Erreur import : ${(e as Error).message}`)
      setPhase('preview')
    }
  }, [preview, clientId, qc])

  const previewSample = useMemo(() => preview?.rows.slice(0, 5) ?? [], [preview])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-violet-600" />
            Importer leads LSA — {clientName}
          </DialogTitle>
          <DialogDescription>
            Téléverse le CSV exporté depuis Google Local Services Ads. Les leads déjà présents
            (même numéro de téléphone) seront ignorés automatiquement.
          </DialogDescription>
        </DialogHeader>

        {phase === 'pick' && (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragging ? 'border-violet-500 bg-violet-50' : 'border-slate-300 bg-slate-50'
            }`}
          >
            <Upload className="mx-auto mb-2 h-10 w-10 text-slate-400" />
            <p className="mb-1 text-sm font-medium text-slate-700">
              Glisse ton fichier CSV ici
            </p>
            <p className="mb-4 text-xs text-slate-500">ou</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Choisir un fichier
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
            <p className="mt-3 text-[11px] text-slate-400">
              Format attendu : colonnes Client / Type de mission / Lieu / Type de lead /
              État de facturation / Création du lead
            </p>
          </div>
        )}

        {phase === 'preview' && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md bg-emerald-50 p-3">
                <div className="text-2xl font-bold text-emerald-700">{preview.rows.length}</div>
                <div className="text-emerald-700">À importer</div>
              </div>
              <div className="rounded-md bg-amber-50 p-3">
                <div className="text-2xl font-bold text-amber-700">{preview.skipped.length}</div>
                <div className="text-amber-700">Ignorés (sans tel)</div>
              </div>
              <div className="rounded-md bg-slate-100 p-3">
                <div className="text-2xl font-bold text-slate-700">{preview.errors.length}</div>
                <div className="text-slate-600">Erreurs</div>
              </div>
            </div>

            <div className="rounded-md border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                Aperçu des 5 premiers leads
              </div>
              <table className="w-full text-xs">
                <thead className="bg-slate-50/50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Téléphone</th>
                    <th className="px-3 py-2 font-medium">Mission</th>
                    <th className="px-3 py-2 font-medium">Ville</th>
                    <th className="px-3 py-2 font-medium">Date LSA</th>
                  </tr>
                </thead>
                <tbody>
                  {previewSample.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono">{r.phone}</td>
                      <td className="px-3 py-2">{r.work_type || <em className="text-slate-400">Non précisée</em>}</td>
                      <td className="px-3 py-2">{r.city}</td>
                      <td className="px-3 py-2 text-slate-500">{r.created_at_lsa}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md bg-rose-50 p-3 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {phase === 'importing' && (
          <div className="py-8 text-center text-sm text-slate-600">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            Import en cours…
          </div>
        )}

        {phase === 'done' && done && (
          <div className="space-y-3 py-4 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h3 className="text-base font-semibold text-slate-900">Import terminé</h3>
            <div className="mx-auto inline-block rounded-md bg-emerald-50 px-4 py-3 text-left text-xs text-emerald-900">
              <div><strong>{done.inserted}</strong> nouveau{done.inserted > 1 ? 'x' : ''} lead{done.inserted > 1 ? 's' : ''} ajouté{done.inserted > 1 ? 's' : ''} au portail</div>
              {done.duplicates > 0 && (
                <div className="text-amber-700"><strong>{done.duplicates}</strong> doublon{done.duplicates > 1 ? 's' : ''} ignoré{done.duplicates > 1 ? 's' : ''} (déjà en DB)</div>
              )}
              {done.skipped > 0 && (
                <div className="text-slate-600"><strong>{done.skipped}</strong> ligne{done.skipped > 1 ? 's' : ''} ignorée{done.skipped > 1 ? 's' : ''} (sans tel)</div>
              )}
            </div>
          </div>
        )}

        {error && phase === 'pick' && (
          <div className="flex items-start gap-2 rounded-md bg-rose-50 p-3 text-xs text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter>
          {phase === 'preview' && (
            <>
              <Button type="button" variant="outline" onClick={reset}>
                <X className="mr-1 h-4 w-4" /> Recommencer
              </Button>
              <Button
                type="button"
                onClick={onImport}
                className="bg-violet-600 hover:bg-violet-700"
              >
                Importer {preview?.rows.length} lead{(preview?.rows.length ?? 0) > 1 ? 's' : ''}
              </Button>
            </>
          )}
          {phase === 'done' && (
            <Button type="button" onClick={() => handleClose(false)}>
              Fermer
            </Button>
          )}
          {phase === 'pick' && (
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Annuler
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
