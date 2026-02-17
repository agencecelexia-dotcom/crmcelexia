import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { USER_ROLE_LABELS } from '@/types/enums'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/shared/status-badge'
import { Loader2, Save, User, Database, Trash2 } from 'lucide-react'
import { seedTestData, clearTestData, type SeedProgress } from '@/lib/seed-data'
import { useQueryClient } from '@tanstack/react-query'

const ROLE_COLORS: Record<string, string> = {
  fondateur: 'bg-purple-100 text-purple-800',
  co_fondateur: 'bg-blue-100 text-blue-800',
  commercial: 'bg-green-100 text-green-800',
}

export function SettingsPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Seed state
  const [seeding, setSeeding] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [seedProgress, setSeedProgress] = useState<SeedProgress | null>(null)
  const [seedResult, setSeedResult] = useState<{ success: boolean; message: string } | null>(null)

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    setSaved(false)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName, phone: phone || null })
        .eq('id', profile.id)
      if (error) throw error
      setSaved(true)
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

  if (!profile) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="text-sm text-muted-foreground">
          Gérez votre profil et vos préférences
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Mon profil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={profile.email} disabled />
          </div>

          <div className="space-y-2">
            <Label>Rôle</Label>
            <div>
              <StatusBadge
                label={USER_ROLE_LABELS[profile.role] ?? profile.role}
                colorClass={ROLE_COLORS[profile.role] ?? 'bg-gray-100 text-gray-800'}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Nom complet</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Votre nom complet"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Téléphone</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="06 12 34 56 78"
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
              <p className="text-sm text-green-600">Profil mis à jour.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dev Tools - Seed Data */}
      <Card className="max-w-xl border-dashed border-orange-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-700">
            <Database className="h-5 w-5" />
            Données de test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Générez des données de test réalistes pour explorer toutes les fonctionnalités du CRM :
            50 prospects dans tous les statuts, appels, rappels, RDV, clients, projets et devis.
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
              {seeding ? 'Génération...' : 'Générer les données de test'}
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
