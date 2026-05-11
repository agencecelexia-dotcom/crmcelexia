import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, Undo2, FileText, Download, AlertCircle, Mail } from 'lucide-react'
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
import { requestCorrectionForAccompagnementStep } from '@/features/portal-admin/services/admin-onboarding-service'
import { sendOnboardingRejectedEmail } from '@/features/portal/services/portal-email-service'
import { supabase } from '@/lib/supabase/client'
import type { ClientAccompagnementStep } from '@/types'
import type { AccompagnementStep } from '@/types/enums'

const PORTAL_LINKED_STEPS: AccompagnementStep[] = [
  'contract_signed', 'payment_received', 'gmb_access_shared', 'insurance_received',
]

/** Motifs de correction pré-rédigés par étape — cohérents avec ce que l'artisan
 *  peut effectivement corriger côté portail. Le fondateur en coche un ou plusieurs
 *  et peut ajouter un commentaire libre. */
const CORRECTION_PRESETS: Record<AccompagnementStep, string[]> = {
  contract_signed: [
    'Signature illisible',
    'Date de signature manquante ou incorrecte',
    'Contrat non signé sur toutes les pages requises',
    'Informations société (SIREN, raison sociale) erronées',
    'Fichier PDF corrompu / impossible à ouvrir',
  ],
  payment_received: [
    'Montant du virement incorrect par rapport au budget convenu',
    'Référence du virement manquante',
    'Preuve de virement illisible',
    'Virement non reçu sur notre compte Celexia',
    'Capture d\'écran / PDF non conforme',
  ],
  gmb_access_shared: [
    'Aucune invitation reçue sur agence.celexia@gmail.com',
    'Rôle attribué incorrect (doit être « Propriétaire »)',
    'Fiche Google Business non trouvée à votre nom',
    'Invitation envoyée vers une mauvaise adresse',
  ],
  insurance_received: [
    'Attestation RC Pro expirée (échéance < 90 jours)',
    'RC Pro pas au nom de votre entreprise',
    'Kbis daté de plus de 3 mois',
    'SIREN / SIRET illisible sur le Kbis',
    'Document corrompu ou illisible',
    'Activité mentionnée ne correspond pas au bâtiment / artisanat',
  ],
  lsa_live: [],
}

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
          className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/50 p-2.5"
        >
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-600">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
            {item.label}
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5"
              disabled={opening === item.path}
              onClick={() => openDoc(item.path)}
            >
              {opening === item.path ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Voir'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={opening === item.path}
              onClick={() => downloadDoc(item.path)}
              title="Télécharger"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function StepValidationDialog({ open, onOpenChange, step }: StepValidationDialogProps) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const markDone = useMarkStepDone()
  const markUndone = useMarkStepUndone()
  const updateNotes = useUpdateStepNotes()

  const [notesDraft, setNotesDraft] = useState('')
  const [resourceUrlDraft, setResourceUrlDraft] = useState('')
  const [confirmUndoOpen, setConfirmUndoOpen] = useState(false)
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [selectedPresets, setSelectedPresets] = useState<string[]>([])
  const [extraComment, setExtraComment] = useState('')
  const [sendingCorrection, setSendingCorrection] = useState(false)

  const presets = step ? CORRECTION_PRESETS[step.step] ?? [] : []

  function togglePreset(preset: string) {
    setSelectedPresets(prev =>
      prev.includes(preset) ? prev.filter(p => p !== preset) : [...prev, preset],
    )
  }

  function buildReason(): string {
    const lines: string[] = []
    if (selectedPresets.length > 0) {
      // Liste à puces (lisible dans l'email)
      lines.push(...selectedPresets.map(p => `• ${p}`))
    }
    const extra = extraComment.trim()
    if (extra) {
      if (lines.length > 0) lines.push('')
      lines.push(extra)
    }
    return lines.join('\n')
  }

  const reasonPreview = buildReason()
  const canSend = reasonPreview.length >= 5

  async function handleSendCorrection() {
    if (!step || !canSend) return
    const reason = reasonPreview
    setSendingCorrection(true)
    try {
      // 1. Reset les flags portail + set rejection_reason + status=in_progress
      await requestCorrectionForAccompagnementStep(step.client_id, step.step, reason)

      // 2. Fetch les infos client pour l'email
      const { data: client } = await supabase
        .from('clients')
        .select('contact_email, contact_firstname, company_name')
        .eq('id', step.client_id)
        .single()
      if (client?.contact_email) {
        sendOnboardingRejectedEmail({
          email: client.contact_email,
          artisan_firstname: client.contact_firstname || 'cher artisan',
          company_name: client.company_name || '',
          rejection_reason: reason,
        })
      }

      // 3. Invalidate les queries (le realtime fait déjà ça, mais on force pour réactif immédiat)
      queryClient.invalidateQueries({ queryKey: ['accompagnement', step.client_id] })
      queryClient.invalidateQueries({ queryKey: ['portal-docs', step.client_id] })

      toast.success('Correction demandée à l\'artisan par email.')
      setCorrectionOpen(false)
      setSelectedPresets([])
      setExtraComment('')
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erreur : ${msg}`)
    } finally {
      setSendingCorrection(false)
    }
  }

  // Reset drafts when dialog opens with a new step
  useEffect(() => {
    if (open && step) {
      setNotesDraft(step.notes ?? '')
      setResourceUrlDraft(step.resource_url ?? '')
    }
  }, [open, step?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset correction draft quand on ouvre le sub-dialog (motifs vides à chaque fois)
  useEffect(() => {
    if (correctionOpen) {
      setSelectedPresets([])
      setExtraComment('')
    }
  }, [correctionOpen])

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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
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
            {PORTAL_LINKED_STEPS.includes(step.step) && (
              <Button
                variant="outline"
                onClick={() => setCorrectionOpen(true)}
                className="text-red-700 hover:text-red-800 border-red-300 hover:bg-red-50"
              >
                <AlertCircle className="mr-2 h-4 w-4" />
                Demander une correction
              </Button>
            )}
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

      {/* Sub-dialog : demander une correction sur cette étape */}
      <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              Demander une correction
            </DialogTitle>
            <DialogDescription>
              L'étape <strong>{ACCOMPAGNEMENT_STEP_LABELS[step.step]}</strong> sera remise en
              "à refaire" côté artisan, et un email lui sera envoyé avec le motif.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Presets : motifs cliquables, multi-sélection */}
            {presets.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Sélectionnez le(s) motif(s) — coche ce qui s'applique
                </Label>
                <div className="flex flex-wrap gap-2">
                  {presets.map(preset => {
                    const selected = selectedPresets.includes(preset)
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => togglePreset(preset)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          selected
                            ? 'border-red-300 bg-red-50 text-red-800'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-red-200 hover:bg-red-50/50'
                        }`}
                      >
                        {selected && <Check className="h-3 w-3" />}
                        {preset}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Commentaire libre additionnel */}
            <div className="space-y-1.5">
              <Label htmlFor="correction-comment" className="text-xs text-muted-foreground">
                Précisions / commentaire (optionnel)
              </Label>
              <Textarea
                id="correction-comment"
                value={extraComment}
                onChange={e => setExtraComment(e.target.value)}
                rows={3}
                placeholder="Ex: La signature est trop pâle, refaites avec un trait plus marqué."
              />
            </div>

            {/* Aperçu de ce qui sera envoyé */}
            {reasonPreview && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Aperçu du message envoyé
                </div>
                <pre className="whitespace-pre-wrap text-xs text-gray-700 font-sans">
                  {reasonPreview}
                </pre>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => setCorrectionOpen(false)}
              disabled={sendingCorrection}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleSendCorrection}
              disabled={sendingCorrection || !canSend}
            >
              {sendingCorrection ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Envoyer la demande
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
