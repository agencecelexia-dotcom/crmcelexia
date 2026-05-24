import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, Loader2, FileText, X, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { usePortalLeads } from '../hooks/use-portal-leads'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Si fourni, le lead est pré-sélectionné et non modifiable. */
  preselectedLeadId?: string
  onSuccess?: () => void
}

/**
 * Dialog : permet à l'artisan d'uploader un devis PDF généré hors du CRM.
 *
 * Champs obligatoires :
 *   - Lead (= client final destinataire du devis)
 *   - PDF du devis
 *   - Montant TTC (> 0)
 *
 * Le bouton "Enregistrer" est disabled tant que les 3 ne sont pas remplis.
 *
 * Workflow :
 *   1. Choisir lead → pré-fill recipient_name depuis portal_leads
 *   2. Drag & drop ou clic pour upload PDF (only .pdf, max 10 Mo)
 *   3. Saisir montant TTC (HT optionnel)
 *   4. Submit → insert quote (is_external=true) → upload PDF dans storage
 *      → update quote.external_pdf_path
 */
export function UploadExternalQuoteDialog({ open, onOpenChange, preselectedLeadId, onSuccess }: Props) {
  const { client } = usePortalAuth()
  const { data: leads } = usePortalLeads(client?.id)

  const [leadId, setLeadId] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [amountTtc, setAmountTtc] = useState<string>('')
  const [amountHt, setAmountHt] = useState<string>('')
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Reset à l'ouverture
  useEffect(() => {
    if (open) {
      setLeadId(preselectedLeadId ?? '')
      setFile(null)
      setAmountTtc('')
      setAmountHt('')
      setSaving(false)
    }
  }, [open, preselectedLeadId])

  const selectedLead = leads?.find(l => l.id === leadId)
  const amountValue = Number((amountTtc || '0').replace(',', '.'))
  const canSubmit = leadId && file && amountValue > 0 && !saving

  function handleFile(f: File | undefined) {
    if (!f) return
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Seuls les fichiers PDF sont acceptés')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error('PDF trop lourd (max 10 Mo)')
      return
    }
    setFile(f)
  }

  async function handleSubmit() {
    if (!canSubmit || !client) return
    setSaving(true)
    try {
      // 1. Génère un quote_number simple basé sur le timestamp
      const now = new Date()
      const quoteNumber = `EXT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${now.getTime().toString().slice(-6)}`

      // 2. Insert quote (sans external_pdf_path pour l'instant, on l'update après upload)
      const ttc = Number((amountTtc || '0').replace(',', '.'))
      const ht = amountHt ? Number(amountHt.replace(',', '.')) : ttc / 1.2  // estim si pas saisi
      const tva = ttc - ht

      const { data: quote, error: qErr } = await supabase
        .from('quotes')
        .insert({
          client_id: client.id,
          quote_number: quoteNumber,
          portal_lead_id: leadId,
          recipient_name: selectedLead?.name || 'Client',
          recipient_email: selectedLead?.email || null,
          recipient_phone: selectedLead?.phone || null,
          recipient_address: selectedLead?.address || null,
          recipient_city: selectedLead?.city || null,
          recipient_postal_code: selectedLead?.postal_code || null,
          valid_until: new Date(Date.now() + 60 * 86400 * 1000).toISOString().slice(0, 10),
          status: 'sent',
          is_external: true,
          external_filename: file!.name,
          total_ht: Math.round(ht * 100) / 100,
          total_tva: Math.round(tva * 100) / 100,
          total_ttc: Math.round(ttc * 100) / 100,
          // Pour external on doit fournir external_pdf_path obligatoirement (check constraint)
          // On met un placeholder temporaire puis on update après upload
          external_pdf_path: '__pending_upload__',
        })
        .select()
        .single()

      if (qErr || !quote) throw new Error(qErr?.message || 'Création devis échouée')

      // 3. Upload PDF dans storage
      const path = `${client.id}/external/${quote.id}.pdf`
      const { error: upErr } = await supabase.storage
        .from('portal-quotes')
        .upload(path, file!, {
          contentType: 'application/pdf',
          upsert: true,
        })
      if (upErr) {
        // Cleanup quote si upload échoue
        await supabase.from('quotes').delete().eq('id', quote.id)
        throw new Error(`Upload PDF échoué : ${upErr.message}`)
      }

      // 4. Update quote avec le path réel
      const { error: updErr } = await supabase
        .from('quotes')
        .update({ external_pdf_path: path })
        .eq('id', quote.id)
      if (updErr) throw new Error(`MAJ devis échouée : ${updErr.message}`)

      toast.success('Devis enregistré et lié au client')
      onSuccess?.()
      onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-violet-600" />
            Importer un devis (PDF)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-600">
            Si vous avez généré votre devis hors du CRM (Word, EBP, Sage…), uploadez-le ici pour le lier à un client et déclencher le suivi.
          </p>

          {/* Lead select */}
          <div>
            <Label className="text-sm font-semibold">Client concerné *</Label>
            {preselectedLeadId ? (
              <div className="mt-1.5 p-2.5 rounded-md border border-slate-200 bg-slate-50 text-sm">
                {selectedLead
                  ? `${selectedLead.name} — ${selectedLead.city || selectedLead.address || 'sans ville'}`
                  : 'Lead pré-sélectionné'}
              </div>
            ) : (
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Choisissez un client dans vos leads…" /></SelectTrigger>
                <SelectContent>
                  {(leads ?? []).map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name || 'Sans nom'}
                      {l.city ? ` — ${l.city}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* PDF upload zone */}
          <div>
            <Label className="text-sm font-semibold">Fichier PDF du devis *</Label>
            {!file ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={(e) => { e.preventDefault(); setDragging(false) }}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  handleFile(e.dataTransfer.files?.[0])
                }}
                onClick={() => fileRef.current?.click()}
                className={`mt-1.5 cursor-pointer border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  dragging
                    ? 'border-violet-500 bg-violet-50'
                    : 'border-slate-300 bg-slate-50 hover:border-violet-400 hover:bg-violet-50/40'
                }`}
              >
                <Upload className={`h-7 w-7 mx-auto mb-2 ${dragging ? 'text-violet-600' : 'text-slate-400'}`} />
                <p className="text-sm font-medium text-slate-700">
                  {dragging ? 'Lâchez le fichier ici' : 'Glissez le PDF ou cliquez pour parcourir'}
                </p>
                <p className="text-xs text-slate-500 mt-1">.pdf — max 10 Mo</p>
                <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden"
                       onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = '' }} />
              </div>
            ) : (
              <div className="mt-1.5 flex items-center gap-3 p-3 rounded-md border border-emerald-200 bg-emerald-50">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 truncate">{file.name}</div>
                  <div className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} Ko</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setFile(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-semibold">Montant TTC * <span className="text-xs text-slate-400 font-normal">(€)</span></Label>
              <Input
                type="text"
                inputMode="decimal"
                value={amountTtc}
                onChange={(e) => setAmountTtc(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="Ex : 4200"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-sm">Montant HT <span className="text-xs text-slate-400 font-normal">(optionnel)</span></Label>
              <Input
                type="text"
                inputMode="decimal"
                value={amountHt}
                onChange={(e) => setAmountHt(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="Auto-calculé si vide"
                className="mt-1.5"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">Sans HT renseigné, on estime à 20% de TVA.</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="bg-violet-600 hover:bg-violet-700 text-white">
            {saving
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enregistrement…</>
              : <>Enregistrer le devis</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
