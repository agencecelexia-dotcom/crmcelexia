import { useEffect, useState } from 'react'
import { Check, Loader2, Undo2, FileText, Download } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useAuth } from '@/features/auth/hooks/use-auth'
import {
  ACCOMPAGNEMENT_STEP_DESCRIPTIONS,
  ACCOMPAGNEMENT_STEP_LABELS,
} from '@/types/enums'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import {
  useMarkStepDone,
  useMarkStepUndone,
  useUpdateStepNotes,
  usePortalDocsForClient,
} from '../hooks/use-accompagnement'
import { getPortalDocSignedUrl, type PortalDocsRow } from '../services/portal-docs-service'
import type { ClientAccompagnementStep } from '@/types'
import type { AccompagnementStep } from '@/types/enums'

interface StepValidationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  step: ClientAccompagnementStep | null
}

/** Mapping étape Accompagnement → docs uploadés par l'artisan dans le portail. */
function docsForStep(stepKey: AccompagnementStep, docs: PortalDocsRow): Array<{ label: string; path: string }> {
  const out: Array<{ label: string; path: string }> = []
  if (stepKey === 'contract_signed' && docs.signed_contract_path) {
    out.push({ label: 'Contrat signé (PDF)', path: docs.signed_contract_path })
  }
  if (stepKey === 'payment_received' && docs.payment_proof_path) {
    out.push({ label: 'Preuve de virement', path: docs.payment_proof_path })
  }
  if (stepKey === 'insurance_received') {
    if (docs.rc_pro_path) out.push({ label: 'Attestation RC Pro', path: docs.rc_pro_path })
    if (docs.kbis_path) out.push({ label: 'Extrait Kbis', path: docs.kbis_path })
  }
  return out
}

function DocsSection({ stepKey, clientId }: { stepKey: AccompagnementStep; clientId: string }) {
  const { data: docs, isLoading } = usePortalDocsForClient(clientId)
  const [opening, setOpening] = useState<string | null>(null)

  async function openDoc(path: string) {
    setOpening(path)
    try {
      const url = await getPortalDocSignedUrl(path)
      // <a target="_blank"> synthétique : safe sur iOS Safari après await
      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Impossible d'ouvrir : ${msg}`)
    } finally {
      setOpening(null)
    }
  }

  async function downloadDoc(path: string) {
    setOpening(path)
    try {
      const url = await getPortalDocSignedUrl(path)
      const link = document.createElement('a')
      link.href = url
      link.download = path.split('/').pop() ?? 'document'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Téléchargement impossible : ${msg}`)
    } finally {
      setOpening(null)
    }
  }

  // GMB : pas de doc, on affiche juste un récap textuel
  if (stepKey === 'gmb_access_shared') {
    if (isLoading) return null
    if (!docs) return null
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        {docs.gmb_access_confirmed ? (
          <>
            ✓ L'artisan a confirmé avoir ajouté <strong>agence.celexia@gmail.com</strong> comme
            propriétaire de sa fiche Google Business
            {docs.gmb_confirmed_at && <> · {formatDate(docs.gmb_confirmed_at)}</>}.
          </>
        ) : (
          <>L'artisan n'a pas encore confirmé l'invitation Google Business.</>
        )}
      </div>
    )
  }

  // Étapes sans documents portail (lsa_live)
  if (stepKey === 'lsa_live') return null

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  if (!docs) return null
  const items = docsForStep(stepKey, docs)
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
        Aucun document fourni par l'artisan pour cette étape (pas encore uploadé).
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Documents fournis par l'artisan</Label>
      {items.map(item => (
        <div
          key={item.path}
          className="flex items-center gap-3 rounded-lg border border-violet-200 bg-violet-50/50 p-2.5"
        >
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-600">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-gray-900">{item.label}</div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={opening === item.path}
            onClick={() => openDoc(item.path)}
          >
            {opening === item.path ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Voir'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={opening === item.path}
            onClick={() => downloadDoc(item.path)}
            title="Télécharger"
          >
            <Download className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  )
}

export function StepValidationDialog({ open, onOpenChange, step }: StepValidationDialogProps) {
  const { profile } = useAuth()
  const markDone = useMarkStepDone()
  const markUndone = useMarkStepUndone()
  const updateNotes = useUpdateStepNotes()

  const [notesDraft, setNotesDraft] = useState('')
  const [resourceUrlDraft, setResourceUrlDraft] = useState('')
  const [confirmUndoOpen, setConfirmUndoOpen] = useState(false)

  // Reset drafts when dialog opens with a new step
  useEffect(() => {
    if (open && step) {
      setNotesDraft(step.notes ?? '')
      setResourceUrlDraft(step.resource_url ?? '')
    }
  }, [open, step?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!step) return null

  const isDone = !!step.completed_at
  const validatorName = step.validator?.full_name ?? null

  async function handleMarkDone() {
    if (!profile || !step) return
    try {
      await markDone.mutateAsync({
        stepId: step.id,
        validatedBy: profile.id,
        clientId: step.client_id,
      })
      toast.success(`"${ACCOMPAGNEMENT_STEP_LABELS[step.step]}" validé`)
    } catch {
      // toast handled by hook
    }
  }

  async function handleMarkUndone() {
    if (!step) return
    try {
      await markUndone.mutateAsync({
        stepId: step.id,
        clientId: step.client_id,
      })
      toast.success('Validation annulée')
      setConfirmUndoOpen(false)
    } catch {
      // toast handled by hook
    }
  }

  async function persistNotes(nextNotes: string, nextUrl: string) {
    if (!step) return
    const notesChanged = nextNotes !== (step.notes ?? '')
    const urlChanged = nextUrl !== (step.resource_url ?? '')
    if (!notesChanged && !urlChanged) return
    try {
      await updateNotes.mutateAsync({
        stepId: step.id,
        notes: nextNotes.trim() === '' ? null : nextNotes,
        resourceUrl: nextUrl.trim() === '' ? null : nextUrl,
        clientId: step.client_id,
      })
    } catch {
      // toast handled by hook
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{ACCOMPAGNEMENT_STEP_LABELS[step.step]}</DialogTitle>
            <DialogDescription>{ACCOMPAGNEMENT_STEP_DESCRIPTIONS[step.step]}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Documents fournis par l'artisan via le portail */}
            <DocsSection stepKey={step.step} clientId={step.client_id} />

            {/* Status / actions */}
            {isDone ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600" />
                  <Badge className="bg-emerald-100 text-emerald-700">Validé</Badge>
                </div>
                <p className="text-sm text-emerald-900">
                  Validé le {formatDate(step.completed_at!)}
                  {validatorName && (
                    <>
                      {' '}
                      par <span className="font-medium">{validatorName}</span>
                    </>
                  )}
                </p>
              </div>
            ) : (
              <Button
                onClick={handleMarkDone}
                disabled={markDone.isPending || !profile}
                className="w-full"
              >
                {markDone.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Marquer comme fait
              </Button>
            )}

            {/* Notes (autosave on blur) */}
            <div className="space-y-1.5">
              <Label htmlFor="step-notes" className="text-xs text-muted-foreground">
                Notes
              </Label>
              <Textarea
                id="step-notes"
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                onBlur={() => persistNotes(notesDraft, resourceUrlDraft)}
                rows={3}
                placeholder="Ajouter des notes sur cette étape..."
              />
            </div>

            {/* Resource URL (autosave on blur) */}
            <div className="space-y-1.5">
              <Label htmlFor="step-resource" className="text-xs text-muted-foreground">
                Lien vers ressource
              </Label>
              <Input
                id="step-resource"
                type="url"
                value={resourceUrlDraft}
                onChange={(e) => setResourceUrlDraft(e.target.value)}
                onBlur={() => persistNotes(notesDraft, resourceUrlDraft)}
                placeholder="https://..."
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {isDone && (
              <Button
                variant="outline"
                onClick={() => setConfirmUndoOpen(true)}
                disabled={markUndone.isPending}
                className="text-amber-700 hover:text-amber-800 border-amber-300 hover:bg-amber-50"
              >
                <Undo2 className="mr-2 h-4 w-4" />
                Annuler la validation
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmUndoOpen}
        onOpenChange={setConfirmUndoOpen}
        title="Annuler la validation ?"
        description={`Cette action remettra "${ACCOMPAGNEMENT_STEP_LABELS[step.step]}" en statut « à faire ».`}
        confirmLabel="Annuler la validation"
        cancelLabel="Garder"
        variant="destructive"
        onConfirm={handleMarkUndone}
      />
    </>
  )
}
