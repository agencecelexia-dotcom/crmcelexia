import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Plus, Trash2, Send, Star, Loader2, Mail, Eye, ExternalLink, Upload, ArrowLeft } from 'lucide-react'
import { usePortalAuth } from '@/features/portal/hooks/use-portal-auth'

interface ReviewCampaign {
  id: string
  name: string | null
  google_review_url: string
  status: string
  total_recipients: number
  total_sent: number
  total_clicked: number
  total_failed: number
  created_at: string
  launched_at: string | null
}

interface Recipient {
  firstname: string
  name: string
  email: string
  project: string
}

type CsvField = 'email' | 'firstname' | 'name' | 'project' | 'ignore'

interface ParsedCsv {
  headers: string[]
  rows: string[][]
  delimiter: string
}

const FIELD_LABELS: Record<CsvField, string> = {
  email: 'Email',
  firstname: 'Prénom',
  name: 'Nom',
  project: 'Projet / Contexte',
  ignore: 'Ignorer',
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV parsing + auto-detection
// ─────────────────────────────────────────────────────────────────────────────

function detectDelimiter(text: string): string {
  const firstLine = text.split('\n')[0] || ''
  const counts: Record<string, number> = {
    ',': (firstLine.match(/,/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
  }
  // Plus haut count = délimiteur. Default ','
  return Object.entries(counts).reduce((a, b) => (b[1] > a[1] ? b : a), [',', 0])[0]
}

function parseCsv(text: string): ParsedCsv | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map(l => l).filter(l => l.trim().length > 0)
  if (lines.length === 0) return null
  const delimiter = detectDelimiter(lines[0])
  const split = (line: string) => line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''))
  return {
    headers: split(lines[0]),
    rows: lines.slice(1).map(split),
    delimiter,
  }
}

function autoDetectField(header: string): CsvField {
  const h = header.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/email|mail|courriel|e-mail/.test(h)) return 'email'
  if (/^pren|first|givenname/.test(h)) return 'firstname'
  if (/^nom|last|surname|family/.test(h)) return 'name'
  if (/proj|context|prestat|service|chantier/.test(h)) return 'project'
  return 'ignore'
}

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function PortalReviewsPage() {
  const { client } = usePortalAuth()
  const [campaigns, setCampaigns] = useState<ReviewCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  // Form state
  const [campaignName, setCampaignName] = useState('')
  const [googleUrl, setGoogleUrl] = useState('')
  const [recipients, setRecipients] = useState<Recipient[]>([{ firstname: '', name: '', email: '', project: '' }])
  const [launching, setLaunching] = useState(false)

  // CSV import state
  const [csvParsed, setCsvParsed] = useState<ParsedCsv | null>(null)
  const [csvMapping, setCsvMapping] = useState<CsvField[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  async function loadCampaigns() {
    if (!client) return
    setLoading(true)
    const { data, error } = await supabase
      .from('review_campaigns')
      .select('id, name, google_review_url, status, total_recipients, total_sent, total_clicked, total_failed, created_at, launched_at')
      .eq('client_id', client.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) toast.error('Erreur chargement campagnes')
    else setCampaigns((data as ReviewCampaign[]) || [])
    setLoading(false)
  }

  useEffect(() => { loadCampaigns() }, [client?.id]) // eslint-disable-line

  // ── Recipients table edits ─────────────────────────────────────────────
  function addRow() {
    setRecipients([...recipients, { firstname: '', name: '', email: '', project: '' }])
  }
  function removeRow(i: number) {
    if (recipients.length === 1) {
      setRecipients([{ firstname: '', name: '', email: '', project: '' }])
      return
    }
    setRecipients(recipients.filter((_, idx) => idx !== i))
  }
  function updateRow(i: number, field: keyof Recipient, val: string) {
    const next = [...recipients]
    next[i] = { ...next[i], [field]: val }
    setRecipients(next)
  }

  // ── CSV import ──────────────────────────────────────────────────────────
  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      const parsed = parseCsv(text)
      if (!parsed || parsed.rows.length === 0) {
        toast.error("CSV vide ou illisible")
        return
      }
      setCsvParsed(parsed)
      setCsvMapping(parsed.headers.map(autoDetectField))
    }
    reader.readAsText(file)
  }

  function handlePastedCsv(text: string) {
    const parsed = parseCsv(text)
    if (!parsed || parsed.rows.length === 0) {
      toast.error("Aucune ligne détectée")
      return
    }
    setCsvParsed(parsed)
    setCsvMapping(parsed.headers.map(autoDetectField))
  }

  function applyCsvMapping() {
    if (!csvParsed) return
    const emailIdx = csvMapping.indexOf('email')
    if (emailIdx === -1) {
      toast.error("Vous devez mapper une colonne sur 'Email'")
      return
    }
    const firstnameIdx = csvMapping.indexOf('firstname')
    const nameIdx = csvMapping.indexOf('name')
    const projectIdx = csvMapping.indexOf('project')

    const imported: Recipient[] = []
    let invalid = 0
    for (const row of csvParsed.rows) {
      const email = (row[emailIdx] || '').trim().toLowerCase()
      if (!EMAIL_RE.test(email)) { invalid++; continue }
      imported.push({
        email,
        firstname: firstnameIdx >= 0 ? (row[firstnameIdx] || '').trim() : '',
        name: nameIdx >= 0 ? (row[nameIdx] || '').trim() : '',
        project: projectIdx >= 0 ? (row[projectIdx] || '').trim() : '',
      })
    }

    if (imported.length === 0) {
      toast.error("Aucun email valide dans le CSV")
      return
    }
    setRecipients(imported)
    setCsvParsed(null)
    setCsvMapping([])
    if (invalid > 0) {
      toast.success(`${imported.length} importés (${invalid} lignes ignorées, email invalide)`)
    } else {
      toast.success(`${imported.length} destinataires importés`)
    }
  }

  function cancelCsv() {
    setCsvParsed(null)
    setCsvMapping([])
  }

  // ── Launch ──────────────────────────────────────────────────────────────
  const validRecipients = useMemo(
    () => recipients.filter(r => r.email && EMAIL_RE.test(r.email)),
    [recipients]
  )
  const canLaunch = googleUrl.trim().length > 8 && validRecipients.length > 0

  async function handleLaunch() {
    if (!client) return
    if (!canLaunch) {
      toast.error("Lien Google + au moins 1 destinataire valide requis")
      return
    }
    setLaunching(true)
    try {
      const { data: camp, error: cErr } = await supabase
        .from('review_campaigns')
        .insert({
          client_id: client.id,
          name: campaignName || null,
          google_review_url: googleUrl.trim(),
          total_recipients: validRecipients.length,
        })
        .select()
        .single()
      if (cErr || !camp) throw new Error(cErr?.message || 'Création campagne échouée')

      const rows = validRecipients.map(r => ({
        campaign_id: camp.id,
        recipient_email: r.email.toLowerCase().trim(),
        recipient_firstname: r.firstname || null,
        recipient_name: r.name || null,
        project_context: r.project || null,
      }))
      const { error: rErr } = await supabase.from('review_requests').insert(rows)
      if (rErr) throw new Error(rErr.message)

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Session expirée')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-review-batch`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ campaign_id: camp.id }),
        }
      )
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Envoi échoué')

      toast.success(`Campagne lancée : ${result.sent} envoyés${result.failed ? `, ${result.failed} échecs` : ''}`)
      resetForm()
      loadCampaigns()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLaunching(false)
    }
  }

  function resetForm() {
    setShowNew(false)
    setCampaignName('')
    setGoogleUrl('')
    setRecipients([{ firstname: '', name: '', email: '', project: '' }])
    setCsvParsed(null)
    setCsvMapping([])
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin h-6 w-6 text-violet-600" /></div>
  }

  if (showNew) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={resetForm}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <Star className="h-6 w-6 text-amber-500" />
          <h1 className="text-2xl font-bold text-slate-900">Nouvelle enquête de satisfaction</h1>
        </div>

        {/* Step 1: campaign basics */}
        <Card className="p-6 mb-4">
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Nom de la campagne <span className="text-slate-400 font-normal">(optionnel, pour vous retrouver)</span></Label>
              <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)}
                     placeholder="Ex : Clients été 2026" className="mt-1.5" />
            </div>
            <div>
              <Label className="text-sm font-semibold">Lien de votre fiche Google *</Label>
              <Input value={googleUrl} onChange={(e) => setGoogleUrl(e.target.value)}
                     placeholder="https://g.page/r/CxxxxxxxEAE/review"
                     className="mt-1.5 font-mono text-sm" />
              <p className="text-xs text-slate-500 mt-1.5">
                Dans Google Business Profile → "Demander des avis" → copiez le lien partagé.
              </p>
            </div>
          </div>
        </Card>

        {/* Step 2: recipients */}
        <Card className="p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">Destinataires</h2>
              <p className="text-sm text-slate-500">{validRecipients.length} email{validRecipients.length > 1 ? 's' : ''} valide{validRecipients.length > 1 ? 's' : ''}</p>
            </div>
            <Button variant="outline" onClick={addRow} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Ajouter une ligne
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
                e.target.value = ''
              }}
            />
          </div>

          {/* Drop zone CSV — drag & drop OR clic pour browser OR paste */}
          {!csvParsed && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragging(false)
                const f = e.dataTransfer.files?.[0]
                if (!f) return
                if (!f.name.toLowerCase().endsWith('.csv') && f.type && !f.type.includes('csv') && !f.type.includes('text')) {
                  toast.error('Format non supporté. Glissez un fichier .csv')
                  return
                }
                handleFile(f)
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`mb-4 cursor-pointer border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                isDragging
                  ? 'border-amber-500 bg-amber-50'
                  : 'border-slate-300 bg-slate-50 hover:border-amber-400 hover:bg-amber-50/50'
              }`}
            >
              <Upload className={`h-8 w-8 mx-auto mb-2 ${isDragging ? 'text-amber-600' : 'text-slate-400'}`} />
              <p className="text-sm font-medium text-slate-700">
                {isDragging ? 'Lâchez le fichier ici' : 'Glissez votre CSV ici ou cliquez pour parcourir'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                .csv — délimiteur auto-détecté (virgule, point-virgule, tabulation)
              </p>
            </div>
          )}

          {/* Paste fallback */}
          {!csvParsed && (
            <details className="mb-4 bg-slate-50 rounded-lg p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">Ou coller un texte (CSV / colonnes séparées)</summary>
              <div className="mt-3">
                <textarea
                  placeholder={`Prénom,Nom,Email,Projet\nMarie,Dupont,marie@exemple.fr,Pose de pergola\n...`}
                  className="w-full h-28 px-3 py-2 border border-slate-200 rounded-md text-sm font-mono"
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text')
                    if (text) {
                      e.preventDefault()
                      handlePastedCsv(text)
                    }
                  }}
                  onChange={(e) => {
                    if (e.target.value.includes('\n')) handlePastedCsv(e.target.value)
                  }}
                />
              </div>
            </details>
          )}

          {/* CSV mapping overlay */}
          {csvParsed && (
            <div className="border-2 border-amber-200 bg-amber-50 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-amber-900 mb-3">Mappez vos colonnes</h3>
              <p className="text-xs text-amber-800 mb-3">
                {csvParsed.rows.length} ligne{csvParsed.rows.length > 1 ? 's' : ''} détectée{csvParsed.rows.length > 1 ? 's' : ''}. Pour chaque colonne ci-dessous, indiquez à quel champ elle correspond. <strong>Email</strong> est obligatoire.
              </p>

              <div className="bg-white rounded-md border border-amber-200 overflow-hidden mb-3">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      {csvParsed.headers.map((h, i) => (
                        <th key={i} className="text-left p-2 border-r border-slate-200 last:border-r-0">
                          <div className="font-semibold text-slate-700 truncate mb-1.5" title={h}>{h || `Colonne ${i + 1}`}</div>
                          <Select
                            value={csvMapping[i] || 'ignore'}
                            onValueChange={(v) => {
                              const next = [...csvMapping]
                              next[i] = v as CsvField
                              setCsvMapping(next)
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(Object.keys(FIELD_LABELS) as CsvField[]).map(f => (
                                <SelectItem key={f} value={f}>{FIELD_LABELS[f]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvParsed.rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {row.map((cell, j) => (
                          <td key={j} className="p-2 border-r border-slate-100 last:border-r-0 text-slate-600 truncate max-w-[150px]" title={cell}>
                            {cell || <span className="text-slate-300">vide</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvParsed.rows.length > 5 && (
                  <div className="text-xs text-slate-500 p-2 bg-slate-50 border-t border-slate-100">… et {csvParsed.rows.length - 5} autre{csvParsed.rows.length - 5 > 1 ? 's' : ''}</div>
                )}
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={cancelCsv}>Annuler</Button>
                <Button size="sm" onClick={applyCsvMapping}
                        disabled={csvMapping.indexOf('email') === -1}
                        className="bg-amber-600 hover:bg-amber-700 text-white">
                  Importer {csvParsed.rows.length} ligne{csvParsed.rows.length > 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          )}

          {/* Recipients editable rows */}
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 px-1 pb-1 text-xs font-medium text-slate-500">
              <div className="col-span-2">Prénom</div>
              <div className="col-span-2">Nom</div>
              <div className="col-span-4">Email *</div>
              <div className="col-span-3">Projet (optionnel)</div>
              <div className="col-span-1"></div>
            </div>
            {recipients.map((r, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <Input className="col-span-2 text-sm" placeholder="Prénom" value={r.firstname}
                       onChange={(e) => updateRow(i, 'firstname', e.target.value)} />
                <Input className="col-span-2 text-sm" placeholder="Nom" value={r.name}
                       onChange={(e) => updateRow(i, 'name', e.target.value)} />
                <Input className="col-span-4 text-sm" type="email" placeholder="email@exemple.fr" value={r.email}
                       onChange={(e) => updateRow(i, 'email', e.target.value)} />
                <Input className="col-span-3 text-sm" placeholder="Ex : pose de portail" value={r.project}
                       onChange={(e) => updateRow(i, 'project', e.target.value)} />
                <Button variant="ghost" size="icon" className="col-span-1"
                        onClick={() => removeRow(i)} disabled={recipients.length === 1 && !r.email && !r.firstname}>
                  <Trash2 className="h-4 w-4 text-rose-500" />
                </Button>
              </div>
            ))}
          </div>
        </Card>

        {/* Launch */}
        <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="text-sm text-slate-600">
            {canLaunch
              ? <>Prêt à envoyer une enquête de satisfaction à <strong>{validRecipients.length} destinataire{validRecipients.length > 1 ? 's' : ''}</strong>.</>
              : <>Renseignez le lien Google et au moins 1 email valide.</>}
          </div>
          <Button onClick={handleLaunch} disabled={!canLaunch || launching}
                  className="bg-amber-500 hover:bg-amber-600 text-white">
            {launching
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Envoi…</>
              : <><Send className="h-4 w-4 mr-2" /> Lancer la campagne</>}
          </Button>
        </div>
      </div>
    )
  }

  // ── List view ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <Star className="h-6 w-6 text-amber-500" />
            <h1 className="text-2xl font-bold text-slate-900">Enquêtes de satisfaction</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Sollicitez vos clients par email pour récolter leurs retours et avis Google.
          </p>
        </div>
        <Button onClick={() => setShowNew(true)} className="bg-amber-500 hover:bg-amber-600 text-white">
          <Plus className="h-4 w-4 mr-2" /> Nouvelle campagne
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <Card className="p-12 text-center">
          <Star className="h-12 w-12 text-amber-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Aucune campagne pour l'instant</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Demandez à vos anciens et nouveaux clients leur retour d'expérience. Ça vous aide à mieux apparaître localement.
          </p>
          <Button onClick={() => setShowNew(true)} className="bg-amber-500 hover:bg-amber-600 text-white">
            Lancer ma première campagne
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-slate-900 truncate">
                      {c.name || `Campagne du ${new Date(c.created_at).toLocaleDateString('fr-FR')}`}
                    </h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      c.status === 'sent' ? 'bg-emerald-100 text-emerald-700' :
                      c.status === 'launching' ? 'bg-amber-100 text-amber-700' :
                      c.status === 'failed' ? 'bg-rose-100 text-rose-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {c.status === 'sent' ? 'Envoyée' :
                       c.status === 'launching' ? 'En cours…' :
                       c.status === 'failed' ? 'Échec' : 'Brouillon'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500 mt-1.5">
                    <span><Mail className="inline h-3 w-3 mr-1" />{c.total_sent}/{c.total_recipients} envoyés</span>
                    <span><Eye className="inline h-3 w-3 mr-1" />{c.total_clicked} clics</span>
                    {c.launched_at && (
                      <span>Lancée {new Date(c.launched_at).toLocaleDateString('fr-FR')}</span>
                    )}
                  </div>
                </div>
                <a href={c.google_review_url} target="_blank" rel="noopener noreferrer"
                   className="text-violet-600 hover:text-violet-700 ml-2">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
