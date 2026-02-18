import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Save, Building2, Database, Trash2, Calendar, Copy, Check } from 'lucide-react'
import { seedTestData, clearTestData, type SeedProgress } from '@/lib/seed-data'
import { useQueryClient } from '@tanstack/react-query'

interface CompanySettings {
  id: string
  company_name: string
  siret: string
  address: string
  city: string
  postal_code: string
  phone: string
  email: string
  website: string
  calcom_link: string
}

export function CompanySettingsPage() {
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Seed state
  const [seeding, setSeeding] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [seedProgress, setSeedProgress] = useState<SeedProgress | null>(null)
  const [seedResult, setSeedResult] = useState<{ success: boolean; message: string } | null>(null)

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const { data, error: fetchErr } = await supabase
          .from('company_settings')
          .select('*')
          .limit(1)
          .single()
        if (fetchErr) throw fetchErr
        if (data) setSettings(data as CompanySettings)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSave() {
    if (!settings) return
    setSaving(true)
    setSaved(false)
    try {
      const { error } = await supabase
        .from('company_settings')
        .update({
          company_name: settings.company_name,
          siret: settings.siret,
          address: settings.address,
          city: settings.city,
          postal_code: settings.postal_code,
          phone: settings.phone,
          email: settings.email,
          website: settings.website,
          calcom_link: settings.calcom_link,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id)
      if (error) throw error
      setSaved(true)
      queryClient.invalidateQueries({ queryKey: ['company-settings'] })
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  async function handleSeed() {
    setSeeding(true)
    setSeedResult(null)
    const result = await seedTestData((p) => setSeedProgress(p))
    setSeedResult(result)
    setSeedProgress(null)
    setSeeding(false)
    // Invalidate all queries so dashboard/lists refresh
    queryClient.invalidateQueries()
  }

  async function handleClear() {
    if (!confirm('Supprimer TOUTES les données (prospects, appels, RDV, clients, projets, devis) ?')) return
    setClearing(true)
    setSeedResult(null)
    const result = await clearTestData()
    setSeedResult(result)
    setClearing(false)
    queryClient.invalidateQueries()
  }

  function update(field: keyof CompanySettings, value: string) {
    setSettings((prev) => prev ? { ...prev, [field]: value } : prev)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Entreprise</h1>
        <p className="text-sm text-red-600">
          Erreur lors du chargement : {error}
        </p>
        <p className="text-sm text-muted-foreground">
          Vérifiez que la migration <code>00004_company_settings.sql</code> a bien été exécutée dans Supabase.
        </p>
        <button className="text-sm text-primary underline" onClick={() => window.location.reload()}>
          Réessayer
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Entreprise</h1>
        <p className="text-sm text-muted-foreground">
          Informations de votre entreprise (apparaîtront sur les devis et factures)
        </p>
      </div>

      {settings && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Informations entreprise
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company_name">Nom de l'entreprise</Label>
                <Input
                  id="company_name"
                  value={settings.company_name}
                  onChange={(e) => update('company_name', e.target.value)}
                  placeholder="Celexia"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="siret">SIRET</Label>
                <Input
                  id="siret"
                  value={settings.siret}
                  onChange={(e) => update('siret', e.target.value)}
                  placeholder="123 456 789 00012"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Adresse</Label>
              <Input
                id="address"
                value={settings.address}
                onChange={(e) => update('address', e.target.value)}
                placeholder="12 rue de l'exemple"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="postal_code">Code postal</Label>
                <Input
                  id="postal_code"
                  value={settings.postal_code}
                  onChange={(e) => update('postal_code', e.target.value)}
                  placeholder="75001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Ville</Label>
                <Input
                  id="city"
                  value={settings.city}
                  onChange={(e) => update('city', e.target.value)}
                  placeholder="Paris"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Telephone</Label>
                <Input
                  id="phone"
                  value={settings.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  placeholder="01 23 45 67 89"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={settings.email}
                  onChange={(e) => update('email', e.target.value)}
                  placeholder="contact@celexia.fr"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Site web</Label>
              <Input
                id="website"
                value={settings.website}
                onChange={(e) => update('website', e.target.value)}
                placeholder="https://celexia.fr"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Enregistrer
              </Button>
              {saved && (
                <p className="text-sm text-emerald-600">Informations mises a jour.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cal.com Integration */}
      {settings && <CalcomSettingsCard settings={settings} onUpdate={update} />}

      {/* Dev Tools - Seed Data */}
      <Card className="max-w-2xl border-dashed border-orange-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-700">
            <Database className="h-5 w-5" />
            Outils de test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generez des donnees de test realistes pour explorer toutes les fonctionnalites du CRM :
            prospects dans tous les statuts, appels, rappels, RDV, clients, projets et devis.
          </p>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSeed}
              disabled={seeding || clearing}
              variant="outline"
              className="border-orange-300 text-orange-700 hover:bg-orange-50"
            >
              {seeding ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Database className="h-4 w-4 mr-2" />
              )}
              {seeding ? 'Generation...' : 'Generer les donnees de test'}
            </Button>

            <Button
              onClick={handleClear}
              disabled={seeding || clearing}
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              {clearing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              {clearing ? 'Suppression...' : 'Tout supprimer'}
            </Button>
          </div>

          {seedProgress && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{seedProgress.step}</p>
              <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all duration-300"
                  style={{ width: `${(seedProgress.current / seedProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {seedResult && (
            <p className={`text-sm ${seedResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
              {seedResult.message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CalcomSettingsCard({
  settings,
  onUpdate,
}: {
  settings: CompanySettings
  onUpdate: (field: keyof CompanySettings, value: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
  const webhookUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/calcom-webhook` : ''

  function handleCopy() {
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Integration Cal.com
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Connectez Cal.com pour creer automatiquement des RDV dans le CRM quand un call est booke.
        </p>

        <div className="space-y-2">
          <Label htmlFor="calcom_link">Lien Cal.com</Label>
          <Input
            id="calcom_link"
            value={settings.calcom_link}
            onChange={(e) => onUpdate('calcom_link', e.target.value)}
            placeholder="cal.com/votre-nom/30min"
          />
          <p className="text-xs text-muted-foreground">
            Le lien de votre page de booking Cal.com. Il apparaitra comme bouton "Booker un RDV" dans le panneau prospect.
          </p>
        </div>

        <div className="space-y-2">
          <Label>URL Webhook (a configurer dans Cal.com)</Label>
          <div className="flex gap-2">
            <Input
              value={webhookUrl}
              readOnly
              className="font-mono text-xs bg-muted"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopy}
              className="shrink-0"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Dans Cal.com : Settings → Webhooks → Add → collez cette URL.
            Selectionnez les evenements : Booking Created, Booking Rescheduled, Booking Cancelled.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
