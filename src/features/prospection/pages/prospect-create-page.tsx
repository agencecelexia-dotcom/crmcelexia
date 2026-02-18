import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useCreateProspect } from '../hooks/use-prospects'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Save } from 'lucide-react'
import { toast } from 'sonner'

export function ProspectCreatePage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const createProspect = useCreateProspect()

  const [form, setForm] = useState({
    company_name: '',
    phone: '',
    contact_name: '',
    contact_firstname: '',
    contact_email: '',
    phone_secondary: '',
    website: '',
    profession: '',
    city: '',
    address: '',
    notes: '',
  })

  function update(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!form.company_name.trim()) {
      toast.error('Le nom de l\'entreprise est obligatoire')
      return
    }
    if (!form.phone.trim()) {
      toast.error('Le numéro de téléphone est obligatoire')
      return
    }

    try {
      const prospect = await createProspect.mutateAsync({
        company_name: form.company_name.trim(),
        phone: form.phone.trim(),
        contact_name: form.contact_name.trim() || null,
        contact_firstname: form.contact_firstname.trim() || null,
        contact_email: form.contact_email.trim() || null,
        phone_secondary: form.phone_secondary.trim() || null,
        website: form.website.trim() || null,
        profession: form.profession.trim() || null,
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        commercial_id: profile!.id,
        source: 'manual' as const,
      })
      toast.success('Prospect créé')
      navigate(`/prospects/${prospect.id}`)
    } catch {
      toast.error('Erreur lors de la création du prospect')
    }
  }

  const field = (key: string, label: string, required = false) => (
    <div className="space-y-1">
      <Label className="text-sm">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        value={form[key as keyof typeof form]}
        onChange={(e) => update(key, e.target.value)}
        required={required}
      />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/prospects')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Nouveau prospect</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informations</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {field('company_name', 'Entreprise', true)}
            {field('phone', 'Téléphone', true)}
            {field('contact_firstname', 'Prénom')}
            {field('contact_name', 'Nom')}
            {field('contact_email', 'Email')}
            {field('phone_secondary', 'Tél. secondaire')}
            {field('profession', 'Métier')}
            {field('city', 'Ville')}
            {field('address', 'Adresse')}
            {field('website', 'Site web')}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={4}
              placeholder="Notes sur le prospect..."
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 mt-6">
          <Button type="button" variant="outline" onClick={() => navigate('/prospects')}>
            Annuler
          </Button>
          <Button type="submit" disabled={createProspect.isPending}>
            <Save className="mr-2 h-4 w-4" />
            Créer le prospect
          </Button>
        </div>
      </form>
    </div>
  )
}
