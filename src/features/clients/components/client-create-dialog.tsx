import { useState } from 'react'
import { z } from 'zod'
import { useCreateClientManually } from '../hooks/use-clients'
import { useAuth } from '@/features/auth/hooks/use-auth'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ClientStatus } from '@/types/enums'

const PROFESSIONS = [
  'paysagiste',
  'pisciniste',
  'plombier',
  'couvreur',
  'maçon',
  'menuisier',
  'déménageur',
  'électricien',
  'autre',
] as const

const formSchema = z.object({
  company_name: z.string().min(1, 'Requis'),
  contact_firstname: z.string().min(1, 'Requis'),
  contact_name: z.string().min(1, 'Requis'),
  contact_email: z.string().email('Email invalide'),
  phone: z.string().regex(/^(\+33|0)[1-9](\s?\d{2}){4}$/, 'Format français invalide (ex: 06 12 34 56 78)'),
  profession: z.string().min(1, 'Requis'),
  city: z.string().nullable(),
  address: z.string().nullable(),
  converted_at: z.string().min(1, 'Requis'),
  status: z.enum(['actif', 'inactif', 'resilie']),
  notes: z.string().nullable(),
})

type FormState = z.infer<typeof formSchema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const todayISO = () => new Date().toISOString().slice(0, 10)

const initialState: FormState = {
  company_name: '',
  contact_firstname: '',
  contact_name: '',
  contact_email: '',
  phone: '',
  profession: '',
  city: null,
  address: null,
  converted_at: todayISO(),
  status: 'actif',
  notes: null,
}

export function ClientCreateDialog({ open, onOpenChange }: Props) {
  const { profile } = useAuth()
  const createMut = useCreateClientManually()
  const [form, setForm] = useState<FormState>(initialState)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    const result = formSchema.safeParse(form)
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof FormState, string>> = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FormState
        fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    if (!profile?.id) return

    await createMut.mutateAsync({
      ...result.data,
      profession: result.data.profession,
      city: result.data.city,
      address: result.data.address,
      notes: result.data.notes,
      commercial_id: profile.id,
    })
    setForm(initialState)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter un client</DialogTitle>
          <DialogDescription>
            Créer un client manuellement (hors funnel prospect classique).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="company_name">Entreprise *</Label>
              <Input
                id="company_name"
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              />
              {errors.company_name && <p className="text-xs text-destructive mt-1">{errors.company_name}</p>}
            </div>
            <div>
              <Label htmlFor="contact_firstname">Prénom *</Label>
              <Input
                id="contact_firstname"
                value={form.contact_firstname}
                onChange={(e) => setForm({ ...form, contact_firstname: e.target.value })}
              />
              {errors.contact_firstname && <p className="text-xs text-destructive mt-1">{errors.contact_firstname}</p>}
            </div>
            <div>
              <Label htmlFor="contact_name">Nom *</Label>
              <Input
                id="contact_name"
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              />
              {errors.contact_name && <p className="text-xs text-destructive mt-1">{errors.contact_name}</p>}
            </div>
            <div>
              <Label htmlFor="contact_email">Email *</Label>
              <Input
                id="contact_email"
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              />
              {errors.contact_email && <p className="text-xs text-destructive mt-1">{errors.contact_email}</p>}
            </div>
            <div>
              <Label htmlFor="phone">Téléphone *</Label>
              <Input
                id="phone"
                value={form.phone}
                placeholder="06 12 34 56 78"
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
            </div>
            <div>
              <Label htmlFor="profession">Profession *</Label>
              <Select value={form.profession} onValueChange={(v) => setForm({ ...form, profession: v })}>
                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>
                  {PROFESSIONS.map((p) => (
                    <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.profession && <p className="text-xs text-destructive mt-1">{errors.profession}</p>}
            </div>
            <div>
              <Label htmlFor="status">Statut initial</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ClientStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="actif">Actif</SelectItem>
                  <SelectItem value="inactif">Inactif</SelectItem>
                  <SelectItem value="resilie">Résilié</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="city">Ville</Label>
              <Input
                id="city"
                value={form.city ?? ''}
                onChange={(e) => setForm({ ...form, city: e.target.value || null })}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="address">Adresse</Label>
              <Input
                id="address"
                value={form.address ?? ''}
                onChange={(e) => setForm({ ...form, address: e.target.value || null })}
              />
            </div>
            <div>
              <Label htmlFor="converted_at">Date de signature *</Label>
              <Input
                id="converted_at"
                type="date"
                value={form.converted_at}
                onChange={(e) => setForm({ ...form, converted_at: e.target.value })}
              />
              {errors.converted_at && <p className="text-xs text-destructive mt-1">{errors.converted_at}</p>}
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={form.notes ?? ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? 'Création…' : 'Créer le client'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
