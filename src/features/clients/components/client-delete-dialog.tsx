import { useState, useEffect } from 'react'
import { useDeleteClient } from '../hooks/use-clients'
import { useAuth } from '@/features/auth/hooks/use-auth'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  companyName: string
  onDeleted?: () => void
}

export function ClientDeleteDialog({ open, onOpenChange, clientId, companyName, onDeleted }: Props) {
  const { profile } = useAuth()
  const deleteMut = useDeleteClient()
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    if (!open) setConfirmText('')
  }, [open])

  const canDelete = confirmText.trim().toLowerCase() === companyName.trim().toLowerCase()

  const handleDelete = async () => {
    if (!canDelete || !profile?.id) return
    await deleteMut.mutateAsync({ id: clientId, actorId: profile.id })
    onOpenChange(false)
    onDeleted?.()
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer ce client ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est <strong>réversible</strong> (soft delete) — le client sera masqué mais peut être
            restauré par un admin si besoin. L'opération est tracée dans le journal d'audit.
            <br />
            <br />
            Pour confirmer, saisis le nom de l'entreprise : <strong>{companyName}</strong>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="my-4">
          <Label htmlFor="confirm-name" className="sr-only">Nom de l'entreprise</Label>
          <Input
            id="confirm-name"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={companyName}
            autoComplete="off"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={!canDelete || deleteMut.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {deleteMut.isPending ? 'Suppression…' : 'Supprimer définitivement'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
