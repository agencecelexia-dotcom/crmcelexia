import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useCreateOpportunity } from '../hooks/use-opportunities'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { OpportunityType } from '@/types/enums'

interface OpportunityCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultProspectId?: string
  defaultClientId?: string
  opportunityType?: OpportunityType
}

export function OpportunityCreateDialog({ open, onOpenChange, defaultProspectId, defaultClientId, opportunityType }: OpportunityCreateDialogProps) {
  const { profile } = useAuth()
  const createMutation = useCreateOpportunity()

  const [name, setName] = useState('')
  const [prospectId, setProspectId] = useState(defaultProspectId ?? '')
  const [projectPrice, setProjectPrice] = useState('')
  const [expectedCloseDate, setExpectedCloseDate] = useState('')
  const [notes, setNotes] = useState('')

  function reset() {
    setName('')
    setProspectId(defaultProspectId ?? '')
    setProjectPrice('')
    setExpectedCloseDate('')
    setNotes('')
  }

  async function handleSubmit() {
    if (!name.trim() || !projectPrice || !profile) {
      toast.error('Le nom et le prix sont obligatoires')
      return
    }

    try {
      await createMutation.mutateAsync({
        prospect_id: prospectId || defaultProspectId || '',
        client_id: defaultClientId || null,
        commercial_id: profile.id,
        name: name.trim(),
        project_price: parseFloat(projectPrice) || 0,
        opportunity_type: opportunityType || 'site_web',
        expected_close_date: expectedCloseDate || null,
        notes: notes.trim() || null,
      })
      reset()
      onOpenChange(false)
    } catch {
      // toast handled by hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle opportunité</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nom de l'opportunité *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Site web + SEO"
            />
          </div>

          <div className="space-y-2">
            <Label>Prix du projet (EUR) *</Label>
            <Input
              type="number"
              min={0}
              value={projectPrice}
              onChange={(e) => setProjectPrice(e.target.value)}
              placeholder="1000"
            />
          </div>

          <div className="space-y-2">
            <Label>Date de closing prévue</Label>
            <Input
              type="date"
              value={expectedCloseDate}
              onChange={(e) => setExpectedCloseDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes sur l'opportunité..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !projectPrice || createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
