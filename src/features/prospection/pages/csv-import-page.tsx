import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { parseCSVFile, validateImportRows, type ParsedCSV } from '@/lib/csv-parser'
import { createImportRecord, importProspects } from '../services/csv-import-service'
import { CSV_IMPORTABLE_FIELDS } from '../constants'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  ArrowLeft,
  ArrowRight,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

type Step = 'upload' | 'preview' | 'mapping' | 'validation' | 'importing' | 'result'

export function CsvImportPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedCSV | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [validRows, setValidRows] = useState<Record<string, string>[]>([])
  const [invalidRows, setInvalidRows] = useState<{ row: number; data: Record<string, string>; reason: string }[]>([])
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)

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
      for (const header of result.headers) {
        const lower = header.toLowerCase().trim()
        for (const field of CSV_IMPORTABLE_FIELDS) {
          const fieldLower = field.label.toLowerCase()
          if (
            lower === field.key ||
            lower === fieldLower ||
            lower.includes(field.key) ||
            lower.includes('nom') && field.key === 'company_name' && !lower.includes('prenom') ||
            lower.includes('phone') && field.key === 'phone' ||
            lower.includes('téléphone') && field.key === 'phone' ||
            lower.includes('tel') && field.key === 'phone' && !lower.includes('site') ||
            lower.includes('mail') && field.key === 'contact_email' ||
            lower.includes('site') && field.key === 'website' ||
            lower.includes('web') && field.key === 'website' ||
            lower.includes('ville') && field.key === 'city' ||
            lower.includes('city') && field.key === 'city' ||
            lower.includes('adresse') && field.key === 'address' ||
            lower.includes('address') && field.key === 'address' ||
            lower.includes('catégorie') && field.key === 'profession' ||
            lower.includes('categorie') && field.key === 'profession' ||
            lower.includes('métier') && field.key === 'profession' ||
            lower.includes('google') && field.key === 'google_maps_url'
          ) {
            if (!Object.values(autoMapping).includes(field.key)) {
              autoMapping[header] = field.key
            }
            break
          }
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
    setStep('importing')

    try {
      const importRecord = await createImportRecord({
        uploaded_by: profile.id,
        original_filename: file.name,
        row_count: parsed?.rowCount ?? 0,
        column_mapping: mapping,
        assigned_commercial_id: profile.id,
      })

      const result = await importProspects(importRecord.id, validRows, profile.id)
      setImportResult(result)
      setStep('result')
      toast.success(`${result.imported} prospects importés`)
    } catch {
      toast.error('Erreur lors de l\'import')
      setStep('validation')
    } finally {
      // import complete
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
      {step === 'mapping' && parsed && (
        <Card>
          <CardHeader>
            <CardTitle>Mapping des colonnes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Associez chaque colonne du CSV à un champ du CRM. Les champs marqués * sont obligatoires.
            </p>
            <div className="space-y-3">
              {parsed.headers.map((header) => (
                <div key={header} className="flex items-center gap-4">
                  <Label className="w-48 truncate font-mono text-sm" title={header}>
                    {header}
                  </Label>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select
                    value={mapping[header] || '_ignore'}
                    onValueChange={(v) =>
                      setMapping((m) => ({ ...m, [header]: v === '_ignore' ? '' : v }))
                    }
                  >
                    <SelectTrigger className="w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_ignore">— Ignorer —</SelectItem>
                      {CSV_IMPORTABLE_FIELDS.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label} {f.required ? '*' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep('preview')}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Retour
              </Button>
              <Button
                onClick={goToValidation}
                disabled={!Object.values(mapping).includes('company_name') || !Object.values(mapping).includes('phone')}
              >
                Valider <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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

            {validRows.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Les {validRows.length} prospects valides seront importés et assignés à votre compte.
              </p>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep('mapping')}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Retour
              </Button>
              <Button
                onClick={startImport}
                disabled={validRows.length === 0}
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
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <div className="text-center">
              <p className="text-2xl font-bold">{importResult.imported} prospects importés</p>
              {importResult.skipped > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {importResult.skipped} ignorés
                </p>
              )}
            </div>
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
