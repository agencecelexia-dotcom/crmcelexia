import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Save, Target } from 'lucide-react'

interface Profile {
  id: string
  full_name: string
}

interface TargetRow {
  commercial_id: string
  calls_per_day: number
  rdv_per_week: number
  conversions_per_month: number
}

export function TargetsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [targets, setTargets] = useState<Record<string, TargetRow>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const [profilesRes, targetsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
        supabase.from('commercial_targets').select('*'),
      ])

      const profs = (profilesRes.data ?? []) as Profile[]
      setProfiles(profs)

      const tMap: Record<string, TargetRow> = {}
      for (const t of (targetsRes.data ?? []) as TargetRow[]) {
        tMap[t.commercial_id] = t
      }
      // Initialize defaults for those without targets
      for (const p of profs) {
        if (!tMap[p.id]) {
          tMap[p.id] = {
            commercial_id: p.id,
            calls_per_day: 50,
            rdv_per_week: 5,
            conversions_per_month: 3,
          }
        }
      }
      setTargets(tMap)
      setLoading(false)
    }
    load()
  }, [])

  function updateTarget(commercialId: string, field: keyof TargetRow, value: number) {
    setTargets((prev) => ({
      ...prev,
      [commercialId]: { ...prev[commercialId], [field]: value },
    }))
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      const rows = Object.values(targets).map((t) => ({
        commercial_id: t.commercial_id,
        calls_per_day: t.calls_per_day,
        rdv_per_week: t.rdv_per_week,
        conversions_per_month: t.conversions_per_month,
        updated_at: new Date().toISOString(),
      }))

      const { error } = await supabase
        .from('commercial_targets')
        .upsert(rows, { onConflict: 'commercial_id' })

      if (error) throw error
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Objectifs</h1>
        <p className="text-sm text-muted-foreground">
          Définissez les objectifs de chaque commercial
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {profiles.map((p) => {
          const t = targets[p.id]
          if (!t) return null
          return (
            <Card key={p.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  {p.full_name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Appels / jour</Label>
                    <Input
                      type="number"
                      min={0}
                      value={t.calls_per_day}
                      onChange={(e) => updateTarget(p.id, 'calls_per_day', Number(e.target.value))}
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">RDV / semaine</Label>
                    <Input
                      type="number"
                      min={0}
                      value={t.rdv_per_week}
                      onChange={(e) => updateTarget(p.id, 'rdv_per_week', Number(e.target.value))}
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Conv. / mois</Label>
                    <Input
                      type="number"
                      min={0}
                      value={t.conversions_per_month}
                      onChange={(e) => updateTarget(p.id, 'conversions_per_month', Number(e.target.value))}
                      className="h-8"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Enregistrer les objectifs
        </Button>
        {saved && (
          <p className="text-sm text-emerald-600">Objectifs mis à jour.</p>
        )}
      </div>
    </div>
  )
}
