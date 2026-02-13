import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Save, Building2 } from 'lucide-react'

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
}

export function CompanySettingsPage() {
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('company_settings')
        .select('*')
        .limit(1)
        .single()
      if (data) setSettings(data as CompanySettings)
      setLoading(false)
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
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id)
      if (error) throw error
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
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

  if (!settings) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Entreprise</h1>
        <p className="text-muted-foreground">
          La table company_settings n'existe pas encore. Exécutez la migration 00004_company_settings.sql dans votre Supabase.
        </p>
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
              <Label htmlFor="phone">Téléphone</Label>
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
              <p className="text-sm text-emerald-600">Informations mises à jour.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
