import { useState, useEffect } from 'react'
import type { Prospect, Client } from '@/types'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Search, UserPlus, CheckCircle2, AlertCircle, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { autoSearchCompany, type CompanySearchResult } from '@/features/contracts/services/company-search-service'
import { prefillFromSearch, type ContractData } from '@/features/contracts/services/contract-generator'
import { inviteArtisanToPortal } from '../services/portal-invite-service'

interface Props {
  // Accepts Client (from client-detail-page) or Prospect-like data
  client: Client | Pick<Client, 'id' | 'company_name' | 'contact_name' | 'contact_firstname' | 'contact_email' | 'city' | 'profession'> & Partial<Pick<Prospect, 'siret' | 'siren'>>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

type Step = 'contract_info' | 'email' | 'result'

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components — gardent le state au parent (un seul source of truth), mais
// chaque étape est isolée pour la lisibilité. Le fichier reste un module
// unique car ces sub-components ne sont pas réutilisables ailleurs.
// ─────────────────────────────────────────────────────────────────────────────

interface ContractInfoStepProps {
  client: Props['client']
  searchQuery: string
  setSearchQuery: (v: string) => void
  searching: boolean
  results: CompanySearchResult[]
  selectedResult: CompanySearchResult | null
  onSearch: (q?: string) => void
  onSelectResult: (r: CompanySearchResult) => void
  civilite: string
  setCivilite: (v: string) => void
  titre: string
  setTitre: (v: string) => void
  prenom: string
  setPrenom: (v: string) => void
  nom: string
  setNom: (v: string) => void
  enseigne: string
  setEnseigne: (v: string) => void
  formeJuridique: string
  setFormeJuridique: (v: string) => void
  siren: string
  setSiren: (v: string) => void
  siret: string
  setSiret: (v: string) => void
  adresse: string
  setAdresse: (v: string) => void
  codePostal: string
  setCodePostal: (v: string) => void
  ville: string
  setVille: (v: string) => void
  rcsVille: string
  setRcsVille: (v: string) => void
  activite: string
  setActivite: (v: string) => void
  commissionRate: number
  setCommissionRate: (v: number) => void
  commissionBase: 'HT' | 'TTC'
  setCommissionBase: (v: 'HT' | 'TTC') => void
  contractInfoReady: boolean
  onCancel: () => void
  onNext: () => void
}

function ContractInfoStep(props: ContractInfoStepProps) {
  const {
    client, searchQuery, setSearchQuery, searching, results, selectedResult,
    onSearch, onSelectResult,
    civilite, setCivilite, titre, setTitre,
    prenom, setPrenom, nom, setNom, enseigne, setEnseigne,
    formeJuridique, setFormeJuridique, siren, setSiren, siret, setSiret,
    adresse, setAdresse, codePostal, setCodePostal, ville, setVille,
    rcsVille, setRcsVille, activite, setActivite,
    commissionRate, setCommissionRate, commissionBase, setCommissionBase,
    contractInfoReady, onCancel, onNext,
  } = props

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-violet-600" />
          Inviter {client.company_name} sur le portail
        </DialogTitle>
      </DialogHeader>

      <p className="text-sm text-muted-foreground">
        Saisissez les infos contrat — elles seront utilisées pour générer le contrat personnalisé que l'artisan signera durant son onboarding.
      </p>

      {/* Search */}
      <div className="flex gap-2">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher l'entreprise..."
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
        />
        <Button variant="outline" size="icon" onClick={() => onSearch()} disabled={searching}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {results.length > 0 && (
        <div className="space-y-1.5 max-h-32 overflow-y-auto">
          {results.map((r) => (
            <div
              key={r.siret}
              className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer text-sm ${
                selectedResult?.siret === r.siret ? 'border-primary bg-primary/5' : 'hover:bg-accent/50'
              }`}
              onClick={() => onSelectResult(r)}
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{r.nom_complet}</p>
                <p className="text-xs text-muted-foreground">{r.adresse} — SIREN {r.siren}</p>
              </div>
              {selectedResult?.siret === r.siret && (
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 ml-2" />
              )}
            </div>
          ))}
        </div>
      )}

      {results.length === 0 && !searching && searchQuery && (
        <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-2 rounded-lg">
          <AlertCircle className="h-4 w-4" />
          Aucune entreprise trouvée. Remplissez manuellement.
        </div>
      )}

      {/* Form */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Civilité</Label>
          <Select value={civilite} onValueChange={setCivilite}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Monsieur">Monsieur</SelectItem>
              <SelectItem value="Madame">Madame</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Titre</Label>
          <Select value={titre} onValueChange={setTitre}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Gérant">Gérant</SelectItem>
              <SelectItem value="Président">Président</SelectItem>
              <SelectItem value="Dirigeant">Dirigeant</SelectItem>
              <SelectItem value="Co-gérant">Co-gérant</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label className="text-xs">Prénom *</Label><Input value={prenom} onChange={(e) => setPrenom(e.target.value)} className="h-8 text-sm" /></div>
        <div className="space-y-1"><Label className="text-xs">Nom *</Label><Input value={nom} onChange={(e) => setNom(e.target.value)} className="h-8 text-sm" /></div>
        <div className="space-y-1"><Label className="text-xs">Enseigne *</Label><Input value={enseigne} onChange={(e) => setEnseigne(e.target.value)} className="h-8 text-sm" /></div>
        <div className="space-y-1"><Label className="text-xs">Forme juridique *</Label><Input value={formeJuridique} onChange={(e) => setFormeJuridique(e.target.value)} className="h-8 text-sm" placeholder="SASU, SARL..." /></div>
        <div className="space-y-1"><Label className="text-xs">SIREN *</Label><Input value={siren} onChange={(e) => setSiren(e.target.value)} className="h-8 text-sm" /></div>
        <div className="space-y-1"><Label className="text-xs">SIRET</Label><Input value={siret} onChange={(e) => setSiret(e.target.value)} className="h-8 text-sm" /></div>
        <div className="col-span-2 space-y-1"><Label className="text-xs">Adresse</Label><Input value={adresse} onChange={(e) => setAdresse(e.target.value)} className="h-8 text-sm" /></div>
        <div className="space-y-1"><Label className="text-xs">Code postal</Label><Input value={codePostal} onChange={(e) => setCodePostal(e.target.value)} className="h-8 text-sm" /></div>
        <div className="space-y-1"><Label className="text-xs">Ville</Label><Input value={ville} onChange={(e) => setVille(e.target.value)} className="h-8 text-sm" /></div>
        <div className="space-y-1"><Label className="text-xs">RCS Ville</Label><Input value={rcsVille} onChange={(e) => setRcsVille(e.target.value)} className="h-8 text-sm" /></div>
        <div className="space-y-1"><Label className="text-xs">Activité</Label><Input value={activite} onChange={(e) => setActivite(e.target.value)} className="h-8 text-sm" /></div>
      </div>

      {/* Commission settings — variables du contrat (article 4) */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
        <p className="text-xs font-semibold text-violet-900">Commission Celexia (article 4 du contrat)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Pourcentage *</Label>
            <div className="relative">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={commissionRate}
                onChange={(e) => setCommissionRate(Number(e.target.value))}
                className="h-8 text-sm pr-7"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Base de calcul *</Label>
            <Select value={commissionBase} onValueChange={(v) => setCommissionBase(v as 'HT' | 'TTC')}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HT">HT (hors taxes)</SelectItem>
                <SelectItem value="TTC">TTC (toutes taxes comprises)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-[11px] text-violet-700">
          Le contrat affichera : « commission équivalente à <strong>{commissionRate} %</strong>{' '}
          {commissionBase === 'HT' ? 'hors taxes (HT)' : 'toutes taxes comprises (TTC)'} du montant total des contrats signés ».
        </p>
      </div>

      <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 mt-4 border-t bg-background px-6 py-3">
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button
          className="bg-violet-600 hover:bg-violet-700"
          disabled={!contractInfoReady}
          onClick={onNext}
        >
          Suivant : Email
        </Button>
      </DialogFooter>
    </>
  )
}

interface EmailStepProps {
  enseigne: string
  email: string
  setEmail: (v: string) => void
  processing: boolean
  onBack: () => void
  onInvite: () => void
}

function EmailStep({ enseigne, email, setEmail, processing, onBack, onInvite }: EmailStepProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-violet-600" />
          Email de l'artisan
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Un compte sera créé pour <strong>{enseigne}</strong>. Les identifiants seront envoyés à cet email.
        </p>
        <div className="space-y-1">
          <Label className="text-xs">Email de l'artisan *</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="artisan@exemple.com"
          />
        </div>
        <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 text-xs text-violet-800">
          Le contrat personnalisé sera pré-rempli avec les infos saisies à l'étape précédente.
          L'artisan le signera directement dans l'onboarding.
        </div>
      </div>
      <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 mt-4 border-t bg-background px-6 py-3">
        <Button variant="ghost" onClick={onBack}>Retour</Button>
        <Button
          className="bg-violet-600 hover:bg-violet-700"
          disabled={!email || processing}
          onClick={onInvite}
        >
          {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
          {processing ? 'Création...' : 'Créer le compte'}
        </Button>
      </DialogFooter>
    </>
  )
}

interface ResultStepProps {
  inviteResult: { email: string; temp_password: string; recovered_existing?: boolean }
  copied: boolean
  onCopy: () => void
  onClose: () => void
}

function ResultStep({ inviteResult, copied, onCopy, onClose }: ResultStepProps) {
  const recovered = inviteResult.recovered_existing
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          {recovered ? 'Compte existant récupéré' : 'Compte créé avec succès'}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        {recovered && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
            ⚠ Cet email avait déjà un compte (création précédente partielle). On a relié ce compte à cette fiche client et regénéré un nouveau mot de passe.
          </div>
        )}
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
          <p className="text-sm font-medium text-emerald-900 mb-2">Un email a été envoyé à l'artisan avec ses identifiants.</p>
          <p className="text-xs text-emerald-700">Tu peux aussi les copier ci-dessous et les lui transmettre directement.</p>
        </div>
        <div className="space-y-2">
          <div>
            <p className="text-xs font-semibold text-gray-500">Email</p>
            <p className="text-sm font-mono">{inviteResult.email}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500">Mot de passe temporaire</p>
            <p className="text-lg font-mono font-bold text-violet-700 bg-violet-50 inline-block px-3 py-1.5 rounded">{inviteResult.temp_password}</p>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Lien de connexion : <strong>{window.location.origin}/portal/auth</strong>
        </p>
      </div>
      <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 mt-4 border-t bg-background px-6 py-3">
        <Button variant="outline" onClick={onCopy}>
          {copied ? <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" /> : <Copy className="mr-2 h-4 w-4" />}
          {copied ? 'Copié !' : 'Copier les identifiants'}
        </Button>
        <Button className="bg-violet-600 hover:bg-violet-700" onClick={onClose}>
          Fermer
        </Button>
      </DialogFooter>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export function PortalInviteDialog({ client, open, onOpenChange, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('contract_info')
  const [processing, setProcessing] = useState(false)

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

  // Commission settings (variables du contrat)
  const [commissionRate, setCommissionRate] = useState<number>(10)
  const [commissionBase, setCommissionBase] = useState<'HT' | 'TTC'>('HT')

  // Email state
  const [email, setEmail] = useState('')
  const [inviteResult, setInviteResult] = useState<{ email: string; temp_password: string; recovered_existing?: boolean } | null>(null)
  const [copied, setCopied] = useState(false)

  // Init when dialog opens
  useEffect(() => {
    if (!open) return
    setStep('contract_info')
    setEmail(client.contact_email || '')
    setSearchQuery(client.company_name)
    setPrenom(client.contact_firstname || '')
    setNom(client.contact_name || '')
    setEnseigne(client.company_name)
    setVille(client.city || '')
    setActivite(client.profession || '')
    if ('siret' in client && client.siret) setSiret(client.siret)
    if ('siren' in client && client.siren) setSiren(client.siren)
    handleSearch(client.company_name)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch(query?: string) {
    const q = query || searchQuery
    if (!q.trim()) return
    setSearching(true)
    try {
      const res = await autoSearchCompany({
        company_name: q,
        contact_name: client.contact_name,
        contact_firstname: client.contact_firstname,
        city: client.city,
      })
      setResults(res)
      if (res.length > 0) selectResult(res[0])
    } catch {
      toast.error('Erreur recherche entreprise')
    } finally {
      setSearching(false)
    }
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

  const contractInfoReady = Boolean(siren && nom && enseigne && formeJuridique)

  async function handleInvite() {
    if (!email) { toast.error('Email requis'); return }
    if (!contractInfoReady) { toast.error('Infos contrat incomplètes'); return }

    setProcessing(true)
    try {
      const contractData: ContractData = {
        client_civilite: civilite, client_prenom: prenom, client_nom: nom,
        client_forme_juridique: formeJuridique, client_enseigne: enseigne,
        client_rcs_ville: rcsVille, client_siren: siren, client_siret: siret,
        client_adresse: adresse, client_code_postal: codePostal,
        client_ville: ville, client_activite: activite, client_titre: titre,
        client_commission_rate: commissionRate,
        client_commission_base: commissionBase,
      }
      const result = await inviteArtisanToPortal(client.id, email, undefined, contractData)
      setInviteResult({
        email: result.email,
        temp_password: result.temp_password,
        recovered_existing: result.recovered_existing,
      })
      setStep('result')
      toast.success(result.recovered_existing ? 'Compte existant récupéré et relié !' : 'Compte artisan créé !')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setProcessing(false)
    }
  }

  function handleCopy() {
    if (!inviteResult) return
    const text = `Email: ${inviteResult.email}\nMot de passe: ${inviteResult.temp_password}\nConnexion: ${window.location.origin}/portal/auth`
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Identifiants copiés !')
    setTimeout(() => setCopied(false), 2000)
  }

  function handleClose() {
    onOpenChange(false)
    setTimeout(() => {
      setStep('contract_info')
      setInviteResult(null)
      if (inviteResult) onSuccess?.()
    }, 300)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        {step === 'contract_info' && (
          <ContractInfoStep
            client={client}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searching={searching}
            results={results}
            selectedResult={selectedResult}
            onSearch={handleSearch}
            onSelectResult={selectResult}
            civilite={civilite}
            setCivilite={setCivilite}
            titre={titre}
            setTitre={setTitre}
            prenom={prenom}
            setPrenom={setPrenom}
            nom={nom}
            setNom={setNom}
            enseigne={enseigne}
            setEnseigne={setEnseigne}
            formeJuridique={formeJuridique}
            setFormeJuridique={setFormeJuridique}
            siren={siren}
            setSiren={setSiren}
            siret={siret}
            setSiret={setSiret}
            adresse={adresse}
            setAdresse={setAdresse}
            codePostal={codePostal}
            setCodePostal={setCodePostal}
            ville={ville}
            setVille={setVille}
            rcsVille={rcsVille}
            setRcsVille={setRcsVille}
            activite={activite}
            setActivite={setActivite}
            commissionRate={commissionRate}
            setCommissionRate={setCommissionRate}
            commissionBase={commissionBase}
            setCommissionBase={setCommissionBase}
            contractInfoReady={contractInfoReady}
            onCancel={handleClose}
            onNext={() => setStep('email')}
          />
        )}

        {step === 'email' && (
          <EmailStep
            enseigne={enseigne}
            email={email}
            setEmail={setEmail}
            processing={processing}
            onBack={() => setStep('contract_info')}
            onInvite={handleInvite}
          />
        )}

        {step === 'result' && inviteResult && (
          <ResultStep
            inviteResult={inviteResult}
            copied={copied}
            onCopy={handleCopy}
            onClose={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
