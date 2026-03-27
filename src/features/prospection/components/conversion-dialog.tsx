import { useState, useEffect } from 'react'
// @ts-expect-error no types for file-saver
import { saveAs } from 'file-saver'
import type { Prospect, Opportunity } from '@/types'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Globe, Megaphone, UserCheck, Loader2, Mail, CheckCircle2, Euro, AlertCircle, Search, FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { useConvertProspect } from '@/features/clients/hooks/use-clients'
import { updateOpportunity } from '@/features/opportunities/services/opportunity-service'
import { useQueryClient } from '@tanstack/react-query'
import { N8N_EMAIL_DRAFT_WEBHOOK } from '@/lib/constants'
import { autoSearchCompany, type CompanySearchResult } from '@/features/contracts/services/company-search-service'
import { generateContract, prefillFromSearch, type ContractData } from '@/features/contracts/services/contract-generator'

type Step = 'choose_type' | 'budget_pub' | 'contract_form' | 'done'

interface Props {
  prospect: Prospect
  linkedOpportunity: Opportunity | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onConversionDone: (clientId: string) => void
}

const LOGO_URL = 'https://crmcelexia.vercel.app/logocelexia.png'
const IBAN_PDF_PATH = '/iban-celexia.pdf'

// ── Email HTML builder ──

function buildHtmlEmail(prospect: Prospect, type: 'site_web' | 'pub', budgetPub: number) {
  const prenom = prospect.contact_firstname || prospect.contact_name || ''
  const enseigne = prospect.company_name
  const budgetStr = budgetPub.toLocaleString('fr-FR')

  const subject = type === 'pub'
    ? `Celexia x ${enseigne} — Lancement de votre campagne pub`
    : `Celexia x ${enseigne} — Lancement de votre site web`

  const stepsHtml = type === 'pub' ? `
        <tr><td style="padding:0 0 18px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td style="width:40px;vertical-align:top;padding-top:2px;"><div style="width:32px;height:32px;border-radius:50%;background:#7C3AED;color:#fff;text-align:center;line-height:32px;font-weight:700;font-size:15px;">1</div></td>
          <td style="padding-left:12px;"><strong style="color:#1a1a2e;font-size:15px;">Signer le contrat de partenariat</strong><p style="margin:4px 0 0;color:#555;font-size:13px;">Vous le trouverez en pièce jointe de cet email. Signez-le et renvoyez-le-nous.</p></td>
        </tr></table></td></tr>
        <tr><td style="padding:0 0 18px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td style="width:40px;vertical-align:top;padding-top:2px;"><div style="width:32px;height:32px;border-radius:50%;background:#7C3AED;color:#fff;text-align:center;line-height:32px;font-weight:700;font-size:15px;">2</div></td>
          <td style="padding-left:12px;"><strong style="color:#1a1a2e;font-size:15px;">Verser votre budget publicitaire</strong><p style="margin:4px 0 0;color:#555;font-size:13px;">Montant : <strong>${budgetStr}\u00a0\u20ac</strong></p><p style="margin:4px 0 0;color:#555;font-size:13px;">Vous trouverez notre IBAN en pièce jointe de cet email.</p></td>
        </tr></table></td></tr>
        <tr><td style="padding:0 0 18px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td style="width:40px;vertical-align:top;padding-top:2px;"><div style="width:32px;height:32px;border-radius:50%;background:#7C3AED;color:#fff;text-align:center;line-height:32px;font-weight:700;font-size:15px;">3</div></td>
          <td style="padding-left:12px;"><strong style="color:#1a1a2e;font-size:15px;">Partager votre fiche Google My Business</strong><p style="margin:4px 0 0;color:#555;font-size:13px;">Ajoutez-nous en tant que gestionnaire :</p>
            <div style="margin:10px 0 0;padding:14px;background:#f8f8fc;border-radius:8px;border:1px solid #e5e5f0;">
              <p style="margin:0 0 6px;font-size:12px;color:#7C3AED;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Mini-tuto (2 min)</p>
              <ol style="margin:0;padding:0 0 0 18px;color:#444;font-size:13px;line-height:1.7;">
                <li>Allez sur <a href="https://business.google.com" style="color:#7C3AED;font-weight:600;text-decoration:none;">business.google.com</a></li>
                <li>Cliquez sur votre établissement</li>
                <li>Dans le menu à gauche, cliquez sur <strong>\u00ab\u00a0Utilisateurs\u00a0\u00bb</strong></li>
                <li>Cliquez sur <strong>\u00ab\u00a0Ajouter des utilisateurs\u00a0\u00bb</strong> (icône +)</li>
                <li>Entrez : <strong style="color:#7C3AED;">agence.celexia@gmail.com</strong></li>
                <li>Rôle : <strong>\u00ab\u00a0Gestionnaire\u00a0\u00bb</strong></li>
                <li>Cliquez <strong>\u00ab\u00a0Inviter\u00a0\u00bb</strong></li>
              </ol>
            </div>
          </td>
        </tr></table></td></tr>
        <tr><td style="padding:0 0 18px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td style="width:40px;vertical-align:top;padding-top:2px;"><div style="width:32px;height:32px;border-radius:50%;background:#7C3AED;color:#fff;text-align:center;line-height:32px;font-weight:700;font-size:15px;">4</div></td>
          <td style="padding-left:12px;"><strong style="color:#1a1a2e;font-size:15px;">Envoyer votre assurance décennale</strong><p style="margin:4px 0 0;color:#555;font-size:13px;">Un simple scan ou photo lisible suffit.</p></td>
        </tr></table></td></tr>` : `
        <tr><td style="padding:0 0 18px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td style="width:40px;vertical-align:top;padding-top:2px;"><div style="width:32px;height:32px;border-radius:50%;background:#7C3AED;color:#fff;text-align:center;line-height:32px;font-weight:700;font-size:15px;">1</div></td>
          <td style="padding-left:12px;"><strong style="color:#1a1a2e;font-size:15px;">Signer le contrat de partenariat</strong><p style="margin:4px 0 0;color:#555;font-size:13px;">Vous le trouverez en pièce jointe de cet email. Signez-le et renvoyez-le-nous.</p></td>
        </tr></table></td></tr>
        <tr><td style="padding:0 0 18px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td style="width:40px;vertical-align:top;padding-top:2px;"><div style="width:32px;height:32px;border-radius:50%;background:#7C3AED;color:#fff;text-align:center;line-height:32px;font-weight:700;font-size:15px;">2</div></td>
          <td style="padding-left:12px;"><strong style="color:#1a1a2e;font-size:15px;">Envoyer votre assurance décennale</strong><p style="margin:4px 0 0;color:#555;font-size:13px;">Un simple scan ou photo lisible suffit.</p></td>
        </tr></table></td></tr>`

  const closingText = type === 'pub'
    ? `C'est tout ce dont on a besoin pour lancer la machine.<br/>Après ça, la seule chose qu'on vous demande, c'est de <strong>décrocher votre téléphone et de vendre</strong> — on s'occupe de vous amener les clients !`
    : `Une fois ces éléments reçus, on s'occupe de tout.<br/>La seule chose qu'on vous demandera ensuite, c'est de <strong>décrocher votre téléphone et de vendre</strong> !`

  return { subject, html: `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head><body style="margin:0;padding:0;background:#f4f1fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f1fa;"><tr><td align="center" style="padding:30px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="580" style="max-width:580px;width:100%;"><tr><td style="background:linear-gradient(135deg,#7C3AED 0%,#5B21B6 100%);border-radius:16px 16px 0 0;padding:32px 30px;text-align:center;"><img src="${LOGO_URL}" alt="Celexia" width="56" height="56" style="display:block;margin:0 auto 12px;border-radius:12px;"/><h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${type === 'pub' ? 'Lancement de votre campagne pub' : 'Lancement de votre site web'}</h1><p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Celexia x ${enseigne}</p></td></tr><tr><td style="background:#ffffff;padding:32px 30px;"><p style="margin:0 0 20px;color:#1a1a2e;font-size:15px;line-height:1.6;">Bonjour ${prenom},</p><p style="margin:0 0 24px;color:#444;font-size:15px;line-height:1.6;">Merci pour votre confiance ! On est ravis de travailler ensemble. Pour qu'on puisse démarrer rapidement, voici ce dont on a besoin de votre côté :</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${stepsHtml}</table><div style="margin:24px 0 0;padding:20px;background:linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%);border-radius:12px;text-align:center;"><p style="margin:0;color:#1a1a2e;font-size:15px;line-height:1.6;">${closingText}</p></div><p style="margin:24px 0 0;color:#444;font-size:15px;line-height:1.6;">À très vite,<br/><strong style="color:#7C3AED;">L'équipe Celexia</strong></p></td></tr><tr><td style="background:#1a1a2e;border-radius:0 0 16px 16px;padding:20px 30px;text-align:center;"><p style="margin:0;color:rgba(255,255,255,0.6);font-size:12px;">Celexia — Agence apport d'affaire</p></td></tr></table></td></tr></table></body></html>` }
}

// ── Helpers ──

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function sendDraftViaWebhook(to: string, subject: string, html: string, attachments: { base64: string; fileName: string; mimeType: string }[]) {
  const res = await fetch(N8N_EMAIL_DRAFT_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, html, attachments }),
  })
  if (!res.ok) throw new Error(`Webhook error: ${res.status}`)
}

// ── Component ──

export function ConversionDialog({ prospect, linkedOpportunity, open, onOpenChange, onConversionDone }: Props) {
  // Steps state
  const [step, setStep] = useState<Step>('choose_type')
  const [projectType, setProjectType] = useState<'site_web' | 'pub' | null>(null)
  const [budgetPub, setBudgetPub] = useState('')
  const [processing, setProcessing] = useState(false)
  const [clientId, setClientId] = useState<string | null>(null)

  // Contract form state
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<CompanySearchResult[]>([])
  const [selectedResult, setSelectedResult] = useState<CompanySearchResult | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [civilite, setCivilite] = useState('Monsieur')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [formeJuridique, setFormeJuridique] = useState('')
  const [enseigne, setEnseigne] = useState('')
  const [rcsVille, setRcsVille] = useState('')
  const [siren, setSiren] = useState('')
  const [siret, setSiret] = useState('')
  const [adresse, setAdresse] = useState('')
  const [codePostal, setCodePostal] = useState('')
  const [ville, setVille] = useState('')
  const [activite, setActivite] = useState('')
  const [titre, setTitre] = useState('Gérant')

  const convertProspect = useConvertProspect()
  const queryClient = useQueryClient()

  // Auto-search when entering contract step
  useEffect(() => {
    if (step !== 'contract_form') return
    setSearchQuery(prospect.company_name)
    handleSearch(prospect.company_name)
    setPrenom(prospect.contact_firstname || '')
    setNom(prospect.contact_name || '')
    setEnseigne(prospect.company_name)
    setVille(prospect.city || '')
    setActivite(prospect.profession || '')
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    setStep('choose_type')
    setProjectType(null)
    setBudgetPub('')
    setProcessing(false)
    setClientId(null)
    setResults([])
    setSelectedResult(null)
    setSearchQuery('')
    setCivilite('Monsieur')
    setPrenom('')
    setNom('')
    setFormeJuridique('')
    setEnseigne('')
    setRcsVille('')
    setSiren('')
    setSiret('')
    setAdresse('')
    setCodePostal('')
    setVille('')
    setActivite('')
    setTitre('Gérant')
  }

  function handleOpenChange(o: boolean) {
    if (!o) reset()
    onOpenChange(o)
  }

  // ── Company search ──

  async function handleSearch(query?: string) {
    const q = query || searchQuery
    if (!q.trim()) return
    setSearching(true)
    try {
      const res = await autoSearchCompany({ company_name: q, contact_name: prospect.contact_name, contact_firstname: prospect.contact_firstname, city: prospect.city })
      setResults(res)
      if (res.length > 0) selectResult(res[0])
    } catch { /* ignore */ } finally { setSearching(false) }
  }

  function selectResult(r: CompanySearchResult) {
    setSelectedResult(r)
    const p = prefillFromSearch(r)
    if (p.client_prenom) setPrenom(p.client_prenom)
    if (p.client_nom) setNom(p.client_nom)
    if (p.client_forme_juridique) setFormeJuridique(p.client_forme_juridique)
    if (p.client_enseigne) setEnseigne(p.client_enseigne)
    if (p.client_rcs_ville) setRcsVille(p.client_rcs_ville)
    if (p.client_siren) setSiren(p.client_siren)
    if (p.client_siret) setSiret(p.client_siret)
    if (p.client_adresse) setAdresse(p.client_adresse)
    if (p.client_code_postal) setCodePostal(p.client_code_postal)
    if (p.client_ville) setVille(p.client_ville)
    if (p.client_titre) setTitre(p.client_titre)
  }

  // ── The big button: convert + generate contract + create draft ──

  async function handleFinalSubmit() {
    if (!siren || !nom || !enseigne) {
      toast.error('SIREN, nom et enseigne sont obligatoires')
      return
    }
    const type = projectType!
    const budget = parseFloat(budgetPub.replace(/\s/g, '').replace(',', '.')) || 0
    setProcessing(true)

    let stepReached = ''
    try {
      // 1. Convert prospect to client
      stepReached = 'conversion'
      const newClientId = await convertProspect.mutateAsync(prospect.id)
      setClientId(newClientId)

      // 2. Update opportunity with type + budget
      stepReached = 'opportunity'
      if (linkedOpportunity) {
        await updateOpportunity(linkedOpportunity.id, {
          opportunity_type: type,
          ...(type === 'pub' && budget ? { budget_pub: budget } : {}),
        } as Partial<Opportunity>)
      }

      // 3. Generate contract PDF
      stepReached = 'contrat'
      const contractData: ContractData = {
        client_civilite: civilite, client_prenom: prenom, client_nom: nom,
        client_forme_juridique: formeJuridique, client_enseigne: enseigne,
        client_rcs_ville: rcsVille, client_siren: siren, client_siret: siret,
        client_adresse: adresse, client_code_postal: codePostal,
        client_ville: ville, client_activite: activite, client_titre: titre,
      }
      const pdfBlob = await generateContract(contractData)
      const fileName = `Contrat Celexia — ${enseigne}.pdf`

      // 4. Download the contract locally
      stepReached = 'download'
      saveAs(pdfBlob, fileName)

      // 5. Build email + attachments
      stepReached = 'email'
      const email = buildHtmlEmail(prospect, type, budget)
      const contractBase64 = await blobToBase64(pdfBlob)
      const attachments = [
        { base64: contractBase64, fileName, mimeType: 'application/pdf' },
      ]

      // 6. Attach IBAN PDF for pub
      if (type === 'pub') {
        try {
          const ibanRes = await fetch(IBAN_PDF_PATH)
          if (ibanRes.ok) {
            const ibanBlob = await ibanRes.blob()
            attachments.push({ base64: await blobToBase64(ibanBlob), fileName: 'IBAN Celexia.pdf', mimeType: 'application/pdf' })
          }
        } catch { /* IBAN fetch failed — continue without */ }
      }

      // 7. Create Gmail draft with contract + IBAN attached
      stepReached = 'webhook'
      if (prospect.contact_email) {
        await sendDraftViaWebhook(prospect.contact_email, email.subject, email.html, attachments)
      }

      // 8. Invalidate caches
      queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
      queryClient.invalidateQueries({ queryKey: ['prospect'] })

      toast.success('Client créé, contrat généré, brouillon Gmail prêt !')
      setStep('done')
    } catch (err) {
      console.error(`[ConversionDialog] Failed at step "${stepReached}":`, err)

      // If conversion succeeded, still show done screen (partial success)
      if (stepReached !== 'conversion') {
        queryClient.invalidateQueries({ queryKey: ['prospects'] })
        queryClient.invalidateQueries({ queryKey: ['prospect'] })
        toast.error(`Client créé mais erreur à l'étape "${stepReached}" — vérifiez la console (F12)`)
        setStep('done')
      } else {
        toast.error('Erreur lors de la conversion')
      }
    } finally {
      setProcessing(false)
    }
  }

  // ── Step handlers ──

  function handleChooseType(type: 'site_web' | 'pub') {
    setProjectType(type)
    setStep(type === 'pub' ? 'budget_pub' : 'contract_form')
  }

  function handleBudgetConfirm() {
    const budget = parseFloat(budgetPub.replace(/\s/g, '').replace(',', '.'))
    if (!budget || budget <= 0) { toast.error('Entrez un budget valide'); return }
    setStep('contract_form')
  }

  function handleFinish() {
    handleOpenChange(false)
    if (clientId) onConversionDone(clientId)
  }

  const isContractReady = siren && nom && enseigne && formeJuridique

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* ── STEP 1: Choose type ── */}
        {step === 'choose_type' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-emerald-600" />
                Convertir en client
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Quel type de projet pour <strong>{prospect.company_name}</strong> ?
            </p>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <Button variant="outline" className="h-24 flex-col gap-2 border-2 hover:border-blue-500 hover:bg-blue-50" onClick={() => handleChooseType('site_web')}>
                <Globe className="h-8 w-8 text-blue-600" />
                <span className="font-semibold">Site Web</span>
              </Button>
              <Button variant="outline" className="h-24 flex-col gap-2 border-2 hover:border-orange-500 hover:bg-orange-50" onClick={() => handleChooseType('pub')}>
                <Megaphone className="h-8 w-8 text-orange-600" />
                <span className="font-semibold">Pub (LSA)</span>
              </Button>
            </div>
          </>
        )}

        {/* ── STEP 2: Budget pub ── */}
        {step === 'budget_pub' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Euro className="h-5 w-5 text-orange-600" />
                Budget publicitaire
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 mt-2">
              <Label>Budget pub mensuel (en euros)</Label>
              <div className="relative">
                <Input type="text" inputMode="numeric" value={budgetPub} onChange={(e) => setBudgetPub(e.target.value)} placeholder="Ex: 500" className="pr-8 text-lg font-semibold" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleBudgetConfirm()} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">€</span>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="ghost" onClick={() => { setStep('choose_type'); setProjectType(null) }}>Retour</Button>
              <Button onClick={handleBudgetConfirm} disabled={!budgetPub}>Suivant</Button>
            </DialogFooter>
          </>
        )}

        {/* ── STEP 3: Contract form ── */}
        {step === 'contract_form' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-violet-600" />
                Infos contrat — {prospect.company_name}
              </DialogTitle>
            </DialogHeader>

            {/* Search bar */}
            <div className="flex gap-2">
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Rechercher l'entreprise..." onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
              <Button variant="outline" size="icon" onClick={() => handleSearch()} disabled={searching}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            {/* Search results */}
            {results.length > 0 && (
              <div className="space-y-1.5 max-h-24 overflow-y-auto">
                {results.map((r) => (
                  <div key={r.siret} className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer text-sm ${selectedResult?.siret === r.siret ? 'border-primary bg-primary/5' : 'hover:bg-accent/50'}`} onClick={() => selectResult(r)}>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.nom_complet}</p>
                      <p className="text-xs text-muted-foreground">SIREN {r.siren}</p>
                    </div>
                    {selectedResult?.siret === r.siret && <CheckCircle2 className="h-4 w-4 text-primary shrink-0 ml-2" />}
                  </div>
                ))}
              </div>
            )}

            {/* Form */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Civilité</Label>
                <Select value={civilite} onValueChange={setCivilite}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Monsieur">Monsieur</SelectItem><SelectItem value="Madame">Madame</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Titre</Label>
                <Select value={titre} onValueChange={setTitre}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Gérant">Gérant</SelectItem><SelectItem value="Président">Président</SelectItem><SelectItem value="Dirigeant">Dirigeant</SelectItem><SelectItem value="Co-gérant">Co-gérant</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Prénom *</Label><Input value={prenom} onChange={(e) => setPrenom(e.target.value)} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Nom *</Label><Input value={nom} onChange={(e) => setNom(e.target.value)} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Enseigne *</Label><Input value={enseigne} onChange={(e) => setEnseigne(e.target.value)} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Forme juridique *</Label><Input value={formeJuridique} onChange={(e) => setFormeJuridique(e.target.value)} className="h-8 text-sm" placeholder="SASU, SARL, EI..." /></div>
              <div className="space-y-1"><Label className="text-xs">SIREN *</Label><Input value={siren} onChange={(e) => setSiren(e.target.value)} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">SIRET</Label><Input value={siret} onChange={(e) => setSiret(e.target.value)} className="h-8 text-sm" /></div>
              <div className="col-span-2 space-y-1"><Label className="text-xs">Adresse</Label><Input value={adresse} onChange={(e) => setAdresse(e.target.value)} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Code postal</Label><Input value={codePostal} onChange={(e) => setCodePostal(e.target.value)} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Ville</Label><Input value={ville} onChange={(e) => setVille(e.target.value)} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">RCS Ville</Label><Input value={rcsVille} onChange={(e) => setRcsVille(e.target.value)} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Activité / Métier</Label><Input value={activite} onChange={(e) => setActivite(e.target.value)} className="h-8 text-sm" /></div>
            </div>

            <DialogFooter className="mt-4">
              <Button variant="ghost" onClick={() => setStep(projectType === 'pub' ? 'budget_pub' : 'choose_type')}>Retour</Button>
              <Button onClick={handleFinalSubmit} disabled={!isContractReady || processing} className="bg-emerald-600 hover:bg-emerald-700">
                {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
                {processing ? 'Traitement...' : 'Convertir, générer contrat et email'}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── STEP 4: Done ── */}
        {step === 'done' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                C'est fait !
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <p className="text-sm font-medium text-emerald-900">Client créé + contrat téléchargé</p>
              </div>
              {prospect.contact_email ? (
                <div className="flex items-center gap-3 p-4 bg-violet-50 rounded-lg border border-violet-200">
                  <Mail className="h-5 w-5 text-violet-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-violet-900">Brouillon Gmail prêt avec contrat{projectType === 'pub' ? ' + IBAN' : ''} en PJ</p>
                    <p className="text-xs text-violet-600">Destinataire : {prospect.contact_email}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                  <p className="text-sm font-medium text-amber-900">Pas d'email — brouillon non créé</p>
                </div>
              )}
            </div>
            <DialogFooter className="mt-4 gap-2">
              {prospect.contact_email && (
                <Button variant="outline" onClick={() => window.open('https://mail.google.com/mail/u/0/#drafts', '_blank')}>
                  <Mail className="mr-2 h-4 w-4" />
                  Ouvrir mes brouillons
                </Button>
              )}
              <Button onClick={handleFinish} className="bg-violet-600 hover:bg-violet-700">
                Voir la fiche client
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
