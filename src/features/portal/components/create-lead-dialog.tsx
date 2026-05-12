import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCreatePortalLead } from '../hooks/use-portal-leads'
import { describeError } from '../lib/error-utils'
import type { PortalLead } from '@/types'

interface CreateLeadDialogProps {
  open: boolean
  onOpenChange: (b: boolean) => void
  clientId: string
  onCreated: (lead: PortalLead) => void
}

/**
 * Dialog de création rapide d'un lead BAO (artisan).
 * `source='bao'` est forcé côté DB par trigger
 * (enforce_portal_leads_artisan_invariants — migration 00087).
 */
export function CreateLeadDialog({
  open, onOpenChange, clientId, onCreated,
}: CreateLeadDialogProps) {
  const create = useCreatePortalLead()
  const [f, setF] = useState({
    name: '', phone: '', email: '',
    address: '', postal_code: '', city: '',
    work_type: '', amount_estimated: '',
  })

  function reset() {
    setF({
      name: '', phone: '', email: '',
      address: '', postal_code: '', city: '',
      work_type: '', amount_estimated: '',
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!f.name.trim() || !f.phone.trim()) {
      toast.error('Nom et téléphone requis')
      return
    }
    try {
      const lead = await create.mutateAsync({
        client_id: clientId,
        name: f.name.trim(),
        phone: f.phone.trim(),
        work_type: f.work_type.trim() || 'À définir',
        email: f.email.trim() || undefined,
        address: f.address.trim() || undefined,
        postal_code: f.postal_code.trim() || undefined,
        city: f.city.trim() || undefined,
        amount_estimated: f.amount_estimated ? Number(f.amount_estimated) : undefined,
      })
      reset()
      onCreated(lead)
    } catch (err) {
      toast.error(`Création échouée : ${describeError(err)}`)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(b) => { if (!b) reset(); onOpenChange(b) }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau lead</DialogTitle>
          <DialogDescription>
            Crée un lead pour ce devis. Les coordonnées seront pré-remplies dans le devis.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Nom *"
              value={f.name}
              onChange={(v) => setF({ ...f, name: v })}
              placeholder="Mme Dupont"
              autoFocus
            />
            <Field
              label="Téléphone *"
              value={f.phone}
              onChange={(v) => setF({ ...f, phone: v })}
              type="tel"
              placeholder="06 12 34 56 78"
            />
          </div>
          <Field
            label="Email"
            value={f.email}
            onChange={(v) => setF({ ...f, email: v })}
            type="email"
            placeholder="contact@…"
          />
          <Field
            label="Adresse"
            value={f.address}
            onChange={(v) => setF({ ...f, address: v })}
            placeholder="12 rue des Lilas"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
            <Field
              label="Code postal"
              value={f.postal_code}
              onChange={(v) => setF({ ...f, postal_code: v })}
              placeholder="75001"
            />
            <Field
              label="Ville"
              value={f.city}
              onChange={(v) => setF({ ...f, city: v })}
              placeholder="Paris"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Type de travaux"
              value={f.work_type}
              onChange={(v) => setF({ ...f, work_type: v })}
              placeholder="Rénovation salle de bain"
            />
            <Field
              label="Montant estimé (€)"
              value={f.amount_estimated}
              onChange={(v) => setF({ ...f, amount_estimated: v })}
              type="number"
              placeholder="2500"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Création…' : 'Créer et sélectionner'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label, value, onChange, placeholder, type = 'text', autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  autoFocus?: boolean
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-[var(--gray-700)]">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-[var(--gray-300)] bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        style={{ fontSize: 16 }}
      />
    </label>
  )
}
