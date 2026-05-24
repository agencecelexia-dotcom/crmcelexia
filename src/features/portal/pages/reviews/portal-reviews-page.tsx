import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { Plus, Trash2, Send, Star, Loader2, Mail, Eye, ExternalLink } from 'lucide-react'
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

export function PortalReviewsPage() {
  const { client } = usePortalAuth()
  const [campaigns, setCampaigns] = useState<ReviewCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  // New campaign form
  const [campaignName, setCampaignName] = useState('')
  const [googleUrl, setGoogleUrl] = useState('')
  const [customIntro, setCustomIntro] = useState('')
  const [recipients, setRecipients] = useState<Recipient[]>([{ firstname: '', name: '', email: '', project: '' }])
  const [csvText, setCsvText] = useState('')
  const [launching, setLaunching] = useState(false)

  async function loadCampaigns() {
    if (!client) return
    setLoading(true)
    const { data, error } = await supabase
      .from('review_campaigns')
      .select('*')
      .eq('client_id', client.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) toast.error('Erreur chargement campagnes')
    else setCampaigns((data as ReviewCampaign[]) || [])
    setLoading(false)
  }

  useEffect(() => { loadCampaigns() }, [client?.id])  // eslint-disable-line

  function addRow() {
    setRecipients([...recipients, { firstname: '', name: '', email: '', project: '' }])
  }
  function removeRow(i: number) {
    setRecipients(recipients.filter((_, idx) => idx !== i))
  }
  function updateRow(i: number, field: keyof Recipient, val: string) {
    const next = [...recipients]
    next[i] = { ...next[i], [field]: val }
    setRecipients(next)
  }
  function parseCsv() {
    // Parse simple : 1 ligne = "prénom, nom, email, projet" (les 3 derniers optionnels)
    const lines = csvText.split('\n').map(l => l.trim()).filter(l => l && l.includes('@'))
    const parsed = lines.map(l => {
      const cols = l.split(/[,;	]/).map(c => c.trim())
      const emailIdx = cols.findIndex(c => c.includes('@'))
      const email = cols[emailIdx] ?? ''
      const firstname = cols[0] && !cols[0].includes('@') ? cols[0] : ''
      const name = cols[1] && !cols[1].includes('@') ? cols[1] : ''
      const project = cols[emailIdx + 1] ?? ''
      return { firstname, name, email, project }
    })
    if (parsed.length === 0) {
      toast.error('Aucune ligne valide trouvée (besoin d\'un email par ligne)')
      return
    }
    setRecipients(parsed)
    setCsvText('')
    toast.success(`${parsed.length} destinataires importés`)
  }

  const validRecipients = useMemo(() => recipients.filter(r => r.email && r.email.includes('@')), [recipients])
  const canLaunch = googleUrl && validRecipients.length > 0

  async function handleLaunch() {
    if (!client) return
    if (!canLaunch) {
      toast.error('Lien Google + au moins 1 destinataire valide requis')
      return
    }
    setLaunching(true)
    try {
      // 1. Create campaign
      const { data: camp, error: cErr } = await supabase
        .from('review_campaigns')
        .insert({
          client_id: client.id,
          name: campaignName || null,
          google_review_url: googleUrl,
          custom_intro: customIntro || null,
          total_recipients: validRecipients.length,
        })
        .select()
        .single()
      if (cErr || !camp) throw new Error(cErr?.message || 'Création campagne échouée')

      // 2. Insert recipients
      const rows = validRecipients.map(r => ({
        campaign_id: camp.id,
        recipient_email: r.email.toLowerCase().trim(),
        recipient_firstname: r.firstname || null,
        recipient_name: r.name || null,
        project_context: r.project || null,
      }))
      const { error: rErr } = await supabase.from('review_requests').insert(rows)
      if (rErr) throw new Error(rErr.message)

      // 3. Launch via Edge Function
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

      toast.success(`Campagne lancée : ${result.sent} emails envoyés, ${result.failed} échecs`)
      setShowNew(false)
      setCampaignName('')
      setGoogleUrl('')
      setCustomIntro('')
      setRecipients([{ firstname: '', name: '', email: '', project: '' }])
      loadCampaigns()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLaunching(false)
    }
  }

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin h-6 w-6 text-violet-600" /></div>
  }

  if (showNew) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Star className="h-6 w-6 text-amber-500" />
          <h1 className="text-2xl font-bold text-slate-900">Nouvelle campagne d'avis Google</h1>
        </div>

        <Card className="p-6 mb-6">
          <div className="space-y-4">
            <div>
              <Label>Nom de la campagne (optionnel, pour vous retrouver)</Label>
              <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)}
                     placeholder="Ex : Clients été 2026" className="mt-1.5" />
            </div>
            <div>
              <Label className="text-sm font-semibold">Lien de votre fiche Google *</Label>
              <Input value={googleUrl} onChange={(e) => setGoogleUrl(e.target.value)}
                     placeholder="https://g.page/r/CxxxxxxxxxxxxxEAE/review"
                     className="mt-1.5 font-mono text-sm" />
              <p className="text-xs text-slate-500 mt-1.5">
                Dans Google Business Profile → "Demander des avis" → copiez le lien partagé.
              </p>
            </div>
            <div>
              <Label className="text-sm">Message d'intro personnalisé (optionnel)</Label>
              <textarea value={customIntro} onChange={(e) => setCustomIntro(e.target.value)}
                        placeholder="On espère que tout s'est bien passé pour votre installation..."
                        className="mt-1.5 w-full h-20 px-3 py-2 border border-slate-200 rounded-md text-sm" />
              <p className="text-xs text-slate-500 mt-1.5">
                Si vide, on utilise un message standard adapté à chaque destinataire.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">Destinataires</h2>
              <p className="text-sm text-slate-500">{validRecipients.length} client(s) avec email valide</p>
            </div>
            <Button variant="outline" onClick={addRow} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Ajouter
            </Button>
          </div>

          <details className="mb-4 bg-slate-50 rounded-lg p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">Import rapide CSV / liste</summary>
            <div className="mt-3">
              <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)}
                        placeholder={`Prénom, Nom, email@exemple.fr, Projet\nMarie, Dupont, marie@exemple.fr, Pose de pergola\n...`}
                        className="w-full h-32 px-3 py-2 border border-slate-200 rounded-md text-sm font-mono" />
              <Button size="sm" variant="outline" className="mt-2" onClick={parseCsv}>
                Importer
              </Button>
            </div>
          </details>

          <div className="space-y-2">
            {recipients.map((r, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <Input className="col-span-2 text-sm" placeholder="Prénom" value={r.firstname}
                       onChange={(e) => updateRow(i, 'firstname', e.target.value)} />
                <Input className="col-span-2 text-sm" placeholder="Nom" value={r.name}
                       onChange={(e) => updateRow(i, 'name', e.target.value)} />
                <Input className="col-span-4 text-sm" type="email" placeholder="email@exemple.fr" value={r.email}
                       onChange={(e) => updateRow(i, 'email', e.target.value)} />
                <Input className="col-span-3 text-sm" placeholder="Projet (optionnel)" value={r.project}
                       onChange={(e) => updateRow(i, 'project', e.target.value)} />
                <Button variant="ghost" size="icon" className="col-span-1"
                        onClick={() => removeRow(i)} disabled={recipients.length === 1}>
                  <Trash2 className="h-4 w-4 text-rose-500" />
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setShowNew(false)} disabled={launching}>
            Annuler
          </Button>
          <Button onClick={handleLaunch} disabled={!canLaunch || launching}
                  className="bg-amber-500 hover:bg-amber-600 text-white">
            {launching ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Envoi en cours...</>
            ) : (
              <><Send className="h-4 w-4 mr-2" /> Lancer la campagne ({validRecipients.length})</>
            )}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <Star className="h-6 w-6 text-amber-500" />
            <h1 className="text-2xl font-bold text-slate-900">Avis Google</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Récoltez des avis Google de vos clients par email.
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
          <p className="text-sm text-slate-500 mb-6">
            Demandez à vos clients de vous laisser un avis Google. Ça vous aide à apparaître plus haut dans les recherches locales.
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
                  <div className="flex items-center gap-2">
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
                       c.status === 'launching' ? 'En cours...' :
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
                   className="text-violet-600 hover:text-violet-700">
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
