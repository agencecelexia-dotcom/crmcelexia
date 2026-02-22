import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { parseCSVFile, validateImportRows, type ParsedCSV } from '@/lib/csv-parser'
import { createImportRecord, importProspects } from '../services/csv-import-service'
import { assignProspectsSplit } from '../services/prospect-service'
import { useTeamMembers } from '../hooks/use-prospects'
import { CSV_IMPORTABLE_FIELDS } from '../constants'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  Users,
  UserPlus,
  Percent,
} from 'lucide-react'
import { toast } from 'sonner'

type Step = 'upload' | 'preview' | 'mapping' | 'validation' | 'importing' | 'result'

export function CsvImportPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedCSV | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [validRows, setValidRows] = useState<Record<string, string>[]>([])
  const [invalidRows, setInvalidRows] = useState<{ row: number; data: Record<string, string>; reason: string }[]>([])
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)

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

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      toast.error('Seuls les fichiers CSV sont acceptés')
      return
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('Le fichier ne doit pas dépasser 10 Mo')
      return
    }

    setFile(selectedFile)
    try {
      const result = await parseCSVFile(selectedFile)
      setParsed(result)

      // Auto-map columns with fuzzy matching
      const autoMapping: Record<string, string> = {}
      function tryMap(header: string, key: string) {
        if (!Object.values(autoMapping).includes(key)) {
          autoMapping[header] = key
          return true
        }
        return false
      }
      for (const header of result.headers) {
        const lower = header.toLowerCase().trim()
        // Exact match on key or label first
        const exactMatch = CSV_IMPORTABLE_FIELDS.find(
          (f) => lower === f.key || lower === f.label.toLowerCase(),
        )
        if (exactMatch) {
          tryMap(header, exactMatch.key)
          continue
        }
        // Fuzzy rules — order matters: more specific rules first
        if (lower.includes('prénom') || lower.includes('prenom') || lower === 'firstname') {
          tryMap(header, 'contact_firstname')
        } else if ((lower.includes('nom') && lower.includes('contact')) || lower === 'contact') {
          tryMap(header, 'contact_name')
        } else if (lower.includes('nom') && (lower.includes('entreprise') || lower.includes('société') || lower.includes('societe') || lower.includes('enseigne'))) {
          tryMap(header, 'company_name')
        } else if (lower === 'nom' || lower === 'name') {
          tryMap(header, 'company_name')
        } else if (lower.includes('mail')) {
          tryMap(header, 'contact_email')
        } else if (lower.includes('google')) {
          tryMap(header, 'google_maps_url')
        } else if (lower.includes('site') || lower.includes('web')) {
          tryMap(header, 'website')
        } else if (lower.includes('téléphone') || lower.includes('telephone') || lower.includes('phone') || (lower.includes('tel') && !lower.includes('site'))) {
          tryMap(header, 'phone')
        } else if (lower.includes('ville') || lower.includes('city')) {
          tryMap(header, 'city')
        } else if (lower.includes('adresse') || lower.includes('address')) {
          tryMap(header, 'address')
        } else if (lower.includes('catégorie') || lower.includes('categorie') || lower.includes('métier') || lower.includes('metier')) {
          tryMap(header, 'profession')
        } else if (lower.includes('zone') || lower.includes('secteur')) {
          tryMap(header, 'zone')
        } else if (lower.includes('note') || lower.includes('commentaire')) {
          tryMap(header, 'notes')
        }
      }
      setMapping(autoMapping)
      setStep('preview')
    } catch {
      toast.error('Erreur lors de la lecture du fichier')
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) handleFileSelect(droppedFile)
  }, [handleFileSelect])

  function goToValidation() {
    if (!parsed) return
    const { valid, invalid } = validateImportRows(parsed.rows, mapping)
    setValidRows(valid)
    setInvalidRows(invalid)
    setStep('validation')
  }

  async function startImport() {
    if (!profile || !file || validRows.length === 0) return
    if (assignMode === 'single' && !assignMember) {
      toast.error('Sélectionnez un membre de l\'équipe')
      return
    }
    if (assignMode === 'split' && (splits.length === 0 || totalPercent !== 100)) {
      toast.error('La répartition doit totaliser 100%')
      return
    }
    setStep('importing')

    const importOwnerId = assignMode === 'single' ? assignMember : profile.id

    try {
      // Clean mapping: remove empty/ignored entries before saving
      const cleanMapping: Record<string, string> = {}
      for (const [key, value] of Object.entries(mapping)) {
        if (value) cleanMapping[key] = value
      }

      const importRecord = await createImportRecord({
        uploaded_by: profile.id,
        original_filename: file.name,
        row_count: parsed?.rowCount ?? 0,
        column_mapping: cleanMapping,
        assigned_commercial_id: importOwnerId,
      })

      const result = await importProspects(importRecord.id, validRows, importOwnerId)

      // If split mode, reassign after import
      if (assignMode === 'split' && result.imported > 0) {
        const { data: importedProspects } = await (await import('@/lib/supabase/client')).supabase
          .from('prospects')
          .select('id')
          .eq('import_id', importRecord.id)
          .limit(result.imported)

        if (importedProspects && importedProspects.length > 0) {
          const ids = importedProspects.map((p) => p.id)
          await assignProspectsSplit(ids, splits)
        }
      }

      setImportResult(result)
      setStep('result')

      // Invalidate prospects cache so the list shows new data immediately
      await queryClient.invalidateQueries({ queryKey: ['prospects'] })

      if (result.imported > 0) {
        toast.success(`${result.imported} prospects importés`)
      }
      if (result.skipped > 0) {
        toast.warning(`${result.skipped} prospects ignorés (erreurs)`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue'
      toast.error(`Erreur lors de l'import : ${message}`)
      setStep('validation')
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/prospects')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Import CSV</h1>
          <p className="text-sm text-muted-foreground">
            Importez des prospects depuis un fichier CSV (Google Maps, etc.)
          </p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex gap-2 text-sm">
        {(['upload', 'preview', 'mapping', 'validation', 'result'] as Step[]).map((s, i) => (
          <Badge
            key={s}
            variant={step === s ? 'default' : 'secondary'}
            className="capitalize"
          >
            {i + 1}. {s === 'upload' ? 'Upload' : s === 'preview' ? 'Aperçu' : s === 'mapping' ? 'Mapping' : s === 'validation' ? 'Validation' : 'Résultat'}
          </Badge>
        ))}
      </div>

      {/* Step: Upload */}
      {step === 'upload' && (
        <Card>
          <CardContent className="py-12">
            <div
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Glissez-déposez votre fichier CSV</p>
              <p className="text-sm text-muted-foreground mt-1">ou cliquez pour sélectionner</p>
              <p className="text-xs text-muted-foreground mt-2">CSV uniquement, max 10 Mo</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Preview */}
      {step === 'preview' && parsed && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Aperçu — {file?.name} ({parsed.rowCount} lignes)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {parsed.errors.length > 0 && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <p className="font-medium text-yellow-800">
                    {parsed.errors.length} avertissement{parsed.errors.length > 1 ? 's' : ''} lors de la lecture du fichier
                  </p>
                </div>
                <div className="max-h-[120px] overflow-auto space-y-1">
                  {parsed.errors.slice(0, 10).map((err, i) => (
                    <p key={i} className="text-sm text-yellow-700">
                      {err.row !== undefined ? `Ligne ${err.row + 1} : ` : ''}{err.message}
                    </p>
                  ))}
                  {parsed.errors.length > 10 && (
                    <p className="text-sm text-yellow-600 font-medium">
                      ... et {parsed.errors.length - 10} avertissements supplémentaires
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="overflow-auto max-h-[400px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    {parsed.headers.map((h) => (
                      <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.rows.slice(0, 10).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      {parsed.headers.map((h) => (
                        <TableCell key={h} className="max-w-[200px] truncate text-sm">
                          {row[h] || '—'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsed.rowCount > 10 && (
              <p className="mt-2 text-sm text-muted-foreground">
                ... et {parsed.rowCount - 10} lignes supplémentaires
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <Button onClick={() => setStep('mapping')}>
                Mapper les colonnes <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Mapping */}
      {step === 'mapping' && parsed && (() => {
        // Compute fields already used by other columns
        const usedFields = new Set(
          Object.entries(mapping)
            .filter(([, v]) => v)
            .map(([, v]) => v),
        )
        const duplicateFields = Object.values(mapping).filter((v) => v).reduce<Record<string, number>>(
          (acc, v) => { acc[v] = (acc[v] ?? 0) + 1; return acc },
          {},
        )
        const hasDuplicates = Object.values(duplicateFields).some((c) => c > 1)

        return (
        <Card>
          <CardHeader>
            <CardTitle>Mapping des colonnes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Associez chaque colonne du CSV à un champ du CRM. Les champs marqués * sont obligatoires.
            </p>
            {hasDuplicates && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
                <p className="text-sm text-yellow-800">
                  Un même champ CRM ne peut pas être associé à plusieurs colonnes CSV.
                </p>
              </div>
            )}
            <div className="space-y-3">
              {parsed.headers.map((header) => {
                const currentValue = mapping[header] || ''
                return (
                <div key={header} className="flex items-center gap-4">
                  <Label className="w-48 truncate font-mono text-sm" title={header}>
                    {header}
                  </Label>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select
                    value={currentValue || '_ignore'}
                    onValueChange={(v) =>
                      setMapping((m) => ({ ...m, [header]: v === '_ignore' ? '' : v }))
                    }
                  >
                    <SelectTrigger className="w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_ignore">— Ignorer —</SelectItem>
                      {CSV_IMPORTABLE_FIELDS.map((f) => {
                        const isUsedByOther = usedFields.has(f.key) && currentValue !== f.key
                        return (
                          <SelectItem key={f.key} value={f.key} disabled={isUsedByOther}>
                            {f.label} {f.required ? '*' : ''}{isUsedByOther ? ' (déjà utilisé)' : ''}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
                )
              })}
            </div>
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep('preview')}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Retour
              </Button>
              <Button
                onClick={goToValidation}
                disabled={!Object.values(mapping).includes('company_name') || !Object.values(mapping).includes('phone') || hasDuplicates}
              >
                Valider <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
        )
      })()}

      {/* Step: Validation */}
      {step === 'validation' && (
        <Card>
          <CardHeader>
            <CardTitle>Validation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="font-medium">{validRows.length} valides</span>
              </div>
              {invalidRows.length > 0 && (
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-500" />
                  <span className="font-medium">{invalidRows.length} invalides</span>
                </div>
              )}
            </div>

            {invalidRows.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 p-4">
                <p className="font-medium text-red-800 mb-2">Lignes avec erreurs :</p>
                <div className="max-h-[200px] overflow-auto space-y-1">
                  {invalidRows.slice(0, 20).map((row) => (
                    <p key={row.row} className="text-sm text-red-700">
                      Ligne {row.row} : {row.reason}
                    </p>
                  ))}
                  {invalidRows.length > 20 && (
                    <p className="text-sm text-red-600 font-medium">
                      ... et {invalidRows.length - 20} erreurs supplémentaires
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Assignment section */}
            {validRows.length > 0 && (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4" />
                  Attribuer les prospects à
                </Label>
                <div className="flex gap-2">
                  <Button
                    variant={assignMode === 'me' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAssignMode('me')}
                    className="flex-1"
                  >
                    Moi
                  </Button>
                  <Button
                    variant={assignMode === 'single' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAssignMode('single')}
                    className="flex-1"
                  >
                    <UserPlus className="h-4 w-4 mr-1" />
                    Un membre
                  </Button>
                  <Button
                    variant={assignMode === 'split' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setAssignMode('split'); if (splits.length === 0) addSplit() }}
                    className="flex-1"
                  >
                    <Percent className="h-4 w-4 mr-1" />
                    Répartir
                  </Button>
                </div>

                {assignMode === 'single' && (
                  <Select value={assignMember} onValueChange={setAssignMember}>
                    <SelectTrigger>
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
                      <div key={i} className="flex items-center gap-2 p-2 rounded border bg-background">
                        <Select
                          value={split.commercial_id}
                          onValueChange={(v) => setSplits(splits.map((s, j) => j === i ? { ...s, commercial_id: v } : s))}
                        >
                          <SelectTrigger className="flex-1 h-8">
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
                          className="h-8 w-16 text-center"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                        <span className="text-xs text-muted-foreground w-10 text-right">
                          ~{Math.round((split.percentage / 100) * validRows.length)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-500"
                          onClick={() => setSplits(splits.filter((_, j) => j !== i))}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <Button variant="outline" size="sm" onClick={addSplit} disabled={splits.length >= members.length}>
                        + Ajouter
                      </Button>
                      <span className={`text-sm font-medium ${totalPercent === 100 ? 'text-green-600' : 'text-red-600'}`}>
                        Total : {totalPercent}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep('mapping')}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Retour
              </Button>
              <Button
                onClick={startImport}
                disabled={
                  validRows.length === 0 ||
                  (assignMode === 'single' && !assignMember) ||
                  (assignMode === 'split' && totalPercent !== 100)
                }
              >
                Importer {validRows.length} prospect{validRows.length > 1 ? 's' : ''}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Importing */}
      {step === 'importing' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">Import en cours...</p>
            <p className="text-sm text-muted-foreground">Veuillez patienter.</p>
          </CardContent>
        </Card>
      )}

      {/* Step: Result */}
      {step === 'result' && importResult && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
            {importResult.imported > 0 ? (
              <CheckCircle2 className="h-16 w-16 text-green-500" />
            ) : (
              <XCircle className="h-16 w-16 text-red-500" />
            )}
            <div className="text-center">
              <p className="text-2xl font-bold">{importResult.imported} prospects importés</p>
              {importResult.skipped > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {importResult.skipped} ignorés (erreurs)
                </p>
              )}
            </div>

            {importResult.errors.length > 0 && (
              <div className="w-full max-w-lg rounded-md border border-red-200 bg-red-50 p-4">
                <p className="font-medium text-red-800 mb-2">Détail des erreurs :</p>
                <div className="max-h-[200px] overflow-auto space-y-1">
                  {importResult.errors.slice(0, 20).map((error, i) => (
                    <p key={i} className="text-sm text-red-700">{error}</p>
                  ))}
                  {importResult.errors.length > 20 && (
                    <p className="text-sm text-red-600 font-medium">
                      ... et {importResult.errors.length - 20} erreurs supplémentaires
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => {
                setStep('upload')
                setFile(null)
                setParsed(null)
                setMapping({})
                setValidRows([])
                setInvalidRows([])
                setImportResult(null)
              }}>
                Nouvel import
              </Button>
              <Button onClick={() => navigate('/prospects')}>
                Voir les prospects
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
