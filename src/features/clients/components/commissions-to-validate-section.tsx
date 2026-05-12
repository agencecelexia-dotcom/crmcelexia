import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useValidateCommissionPayment } from '@/features/portal/hooks/use-portal-leads'
import { formatCurrency } from '@/lib/format'
import type { PortalLead } from '@/types'

interface DeclaredCommissionRow extends Pick<PortalLead,
  'id' | 'name' | 'signed_amount' | 'commission_amount' | 'commission_declared_paid_at' | 'signed_at'> {}

/**
 * Liste les commissions déclarées "payées" par un artisan pour ce client,
 * avec boutons Valider / Refuser. À placer dans la carte Accompagnement.
 */
export function CommissionsToValidateSection({ clientId }: { clientId: string }) {
  const validate = useValidateCommissionPayment()
  const [approveTarget, setApproveTarget] = useState<DeclaredCommissionRow | null>(null)
  const [disputeTarget, setDisputeTarget] = useState<DeclaredCommissionRow | null>(null)
  const [disputeNotes, setDisputeNotes] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-commissions-pending', clientId],
    queryFn: async (): Promise<DeclaredCommissionRow[]> => {
      const { data, error } = await supabase
        .from('portal_leads')
        .select('id, name, signed_amount, commission_amount, commission_declared_paid_at, signed_at')
        .eq('client_id', clientId)
        .eq('commission_status', 'declared_paid')
        .is('deleted_at', null)
        .order('commission_declared_paid_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as DeclaredCommissionRow[]
    },
    enabled: !!clientId,
  })

  if (isLoading) {
    return <div className="mt-6 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Chargement commissions...</div>
  }
  if (!data || data.length === 0) return null

  return (
    <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-700" />
        <h4 className="text-sm font-semibold text-amber-900">
          Commissions déclarées payées · à vérifier ({data.length})
        </h4>
      </div>
      <p className="mb-3 text-xs text-amber-800">
        L'artisan a déclaré avoir viré ces commissions. Vérifiez la réception du virement bancaire puis validez ou demandez une clarification.
      </p>
      <ul className="space-y-2">
        {data.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-white p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{row.name}</div>
              <div className="text-xs text-muted-foreground">
                Devis signé {row.signed_at ?? '—'} · Montant {formatCurrency(Number(row.signed_amount ?? 0))} ·
                Commission <strong className="text-violet-700">{formatCurrency(Number(row.commission_amount ?? 0))}</strong>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Déclarée payée le {row.commission_declared_paid_at ? new Date(row.commission_declared_paid_at).toLocaleString('fr-FR') : '—'}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                onClick={() => setApproveTarget(row)}
                disabled={validate.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Valider
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setDisputeNotes(''); setDisputeTarget(row) }}
                disabled={validate.isPending}
              >
                À clarifier
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {/* Confirm approve */}
      <AlertDialog open={!!approveTarget} onOpenChange={(open) => !open && setApproveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Valider la commission&nbsp;?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirmez avoir reçu le virement de <strong>{formatCurrency(Number(approveTarget?.commission_amount ?? 0))}</strong> pour
              le lead <strong>{approveTarget?.name}</strong>. L'artisan recevra un email de confirmation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!approveTarget) return
                validate.mutate({ leadId: approveTarget.id, approved: true })
                setApproveTarget(null)
              }}
            >
              Valider le paiement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dispute dialog with notes */}
      <Dialog open={!!disputeTarget} onOpenChange={(open) => !open && setDisputeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demander une clarification</DialogTitle>
            <DialogDescription>
              Pour la commission de <strong>{disputeTarget?.name}</strong> ({formatCurrency(Number(disputeTarget?.commission_amount ?? 0))}).
              Expliquez ce qui pose souci — l'artisan recevra ce message par email.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={disputeNotes}
            onChange={(e) => setDisputeNotes(e.target.value)}
            placeholder="Ex : Aucun virement reçu de votre IBAN. Pouvez-vous nous renvoyer la preuve ?"
            rows={4}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeTarget(null)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!disputeTarget) return
                validate.mutate({
                  leadId: disputeTarget.id,
                  approved: false,
                  notes: disputeNotes.trim() || undefined,
                })
                setDisputeTarget(null)
              }}
            >
              Envoyer la demande
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
