import { useState, useEffect } from 'react'
// @ts-expect-error no types for file-saver
import { saveAs } from 'file-saver'
import type { Prospect } from '@/types'
import { autoSearchCompany, type CompanySearchResult } from '../services/company-search-service'
import { generateContract, prefillFromSearch, type ContractData } from '../services/contract-generator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Search, FileText, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  prospect: Prospect
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GenerateContractDialog({ prospect, open, onOpenChange }: Props) {
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<CompanySearchResult[]>([])
  const [selectedResult, setSelectedResult] = useState<CompanySearchResult | null>(null)
  const [generating, setGenerating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Form fields
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

  // Auto-search on open
  useEffect(() => {
    if (!open) return
    setSearchQuery(prospect.company_name)
    handleSearch(prospect.company_name)
    // Pre-fill from prospect data
    setPrenom(prospect.contact_firstname || '')
    setNom(prospect.contact_name || '')
    setEnseigne(prospect.company_name)
    setVille(prospect.city || '')
    setActivite(prospect.profession || '')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch(query?: string) {
    const q = query || searchQuery
    if (!q.trim()) return
    setSearching(true)
    try {
      const res = await autoSearchCompany({
        company_name: q,
        contact_name: prospect.contact_name,
        contact_firstname: prospect.contact_firstname,
        city: prospect.city,
      })
      setResults(res)
      if (res.length > 0) {
        selectResult(res[0])
      }
    } catch {
      toast.error('Erreur lors de la recherche entreprise')
    } finally {
      setSearching(false)
    }
  }

  function selectResult(r: CompanySearchResult) {
    setSelectedResult(r)
    const prefilled = prefillFromSearch(r)
    if (prefilled.client_prenom) setPrenom(prefilled.client_prenom)
    if (prefilled.client_nom) setNom(prefilled.client_nom)
    if (prefilled.client_forme_juridique) setFormeJuridique(prefilled.client_forme_juridique)
    if (prefilled.client_enseigne) setEnseigne(prefilled.client_enseigne)
    if (prefilled.client_rcs_ville) setRcsVille(prefilled.client_rcs_ville)
    if (prefilled.client_siren) setSiren(prefilled.client_siren)
    if (prefilled.client_siret) setSiret(prefilled.client_siret)
    if (prefilled.client_adresse) setAdresse(prefilled.client_adresse)
    if (prefilled.client_code_postal) setCodePostal(prefilled.client_code_postal)
    if (prefilled.client_ville) setVille(prefilled.client_ville)
    if (prefilled.client_titre) setTitre(prefilled.client_titre)
  }

  async function handleGenerate() {
    if (!siren || !nom || !enseigne) {
      toast.error('SIREN, nom et enseigne sont obligatoires')
      return
    }
    setGenerating(true)
    try {
      const data: ContractData = {
        client_civilite: civilite,
        client_prenom: prenom,
        client_nom: nom,
        client_forme_juridique: formeJuridique,
        client_enseigne: enseigne,
        client_rcs_ville: rcsVille,
        client_siren: siren,
        client_siret: siret,
        client_adresse: adresse,
        client_code_postal: codePostal,
        client_ville: ville,
        client_activite: activite,
        client_titre: titre,
      }
      const blob = await generateContract(data)
      const fileName = `Contrat Celexia — ${enseigne}.pdf`
      saveAs(blob, fileName)
      toast.success('Contrat généré avec succès')
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors de la génération du contrat')
    } finally {
      setGenerating(false)
    }
  }

  const isReady = siren && nom && enseigne && formeJuridique

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Générer un contrat de partenariat
          </DialogTitle>
        </DialogHeader>

        {/* Search bar */}
        <div className="flex gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher l'entreprise (nom, dirigeant...)"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button variant="outline" size="icon" onClick={() => handleSearch()} disabled={searching}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {/* Search results */}
        {results.length > 0 && (
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {results.map((r) => (
              <div
                key={r.siret}
                className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                  selectedResult?.siret === r.siret
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-accent/50'
                }`}
                onClick={() => selectResult(r)}
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
          <div className="space-y-1">
            <Label className="text-xs">Prénom *</Label>
            <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nom *</Label>
            <Input value={nom} onChange={(e) => setNom(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Enseigne / Nom commercial *</Label>
            <Input value={enseigne} onChange={(e) => setEnseigne(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Forme juridique</Label>
            <Input value={formeJuridique} onChange={(e) => setFormeJuridique(e.target.value)} className="h-8 text-sm" placeholder="SASU, SARL, EI..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">SIREN *</Label>
            <Input value={siren} onChange={(e) => setSiren(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">SIRET</Label>
            <Input value={siret} onChange={(e) => setSiret(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Adresse</Label>
            <Input value={adresse} onChange={(e) => setAdresse(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Code postal</Label>
            <Input value={codePostal} onChange={(e) => setCodePostal(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ville</Label>
            <Input value={ville} onChange={(e) => setVille(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">RCS Ville</Label>
            <Input value={rcsVille} onChange={(e) => setRcsVille(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Activité / Métier</Label>
            <Input value={activite} onChange={(e) => setActivite(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleGenerate} disabled={!isReady || generating}>
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Télécharger le contrat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
