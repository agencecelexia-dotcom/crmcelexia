import { useState, type MutableRefObject } from 'react'
import type { Prospect, Opportunity } from '@/types'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Globe, Megaphone, UserCheck, Loader2, Mail, CheckCircle2, Euro, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useConvertProspect } from '@/features/clients/hooks/use-clients'
import { updateOpportunity } from '@/features/opportunities/services/opportunity-service'
import { useQueryClient } from '@tanstack/react-query'
import { N8N_EMAIL_DRAFT_WEBHOOK } from '@/lib/constants'

type Step = 'choose_type' | 'budget_pub' | 'email_ready'

interface Props {
  prospect: Prospect
  linkedOpportunity: Opportunity | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onConversionDone: (clientId: string) => void
  onOpenContract: () => void
  contractCallbackRef: MutableRefObject<((blob: Blob, fileName: string) => void) | null>
}

const LOGO_URL = 'https://crmcelexia.vercel.app/logocelexia.png'
const IBAN_PDF_PATH = '/iban-celexia.pdf'

function buildHtmlEmail(prospect: Prospect, type: 'site_web' | 'pub', budgetPub: number) {
  const prenom = prospect.contact_firstname || prospect.contact_name || ''
  const enseigne = prospect.company_name
  const budgetStr = budgetPub.toLocaleString('fr-FR')

  const subject = type === 'pub'
    ? `Celexia x ${enseigne} — Lancement de votre campagne pub`
    : `Celexia x ${enseigne} — Lancement de votre site web`

  const stepsHtml = type === 'pub' ? `
        <tr>
          <td style="padding:0 0 18px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="width:40px;vertical-align:top;padding-top:2px;">
                  <div style="width:32px;height:32px;border-radius:50%;background:#7C3AED;color:#fff;text-align:center;line-height:32px;font-weight:700;font-size:15px;">1</div>
                </td>
                <td style="padding-left:12px;">
                  <strong style="color:#1a1a2e;font-size:15px;">Signer le contrat de partenariat</strong>
                  <p style="margin:4px 0 0;color:#555;font-size:13px;">Vous le trouverez en pièce jointe de cet email. Signez-le et renvoyez-le-nous.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 18px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="width:40px;vertical-align:top;padding-top:2px;">
                  <div style="width:32px;height:32px;border-radius:50%;background:#7C3AED;color:#fff;text-align:center;line-height:32px;font-weight:700;font-size:15px;">2</div>
                </td>
                <td style="padding-left:12px;">
                  <strong style="color:#1a1a2e;font-size:15px;">Verser votre budget publicitaire</strong>
                  <p style="margin:4px 0 0;color:#555;font-size:13px;">Montant : <strong>${budgetStr}\u00a0\u20ac</strong></p>
                  <p style="margin:4px 0 0;color:#555;font-size:13px;">Vous trouverez notre IBAN en pièce jointe de cet email.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 18px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="width:40px;vertical-align:top;padding-top:2px;">
                  <div style="width:32px;height:32px;border-radius:50%;background:#7C3AED;color:#fff;text-align:center;line-height:32px;font-weight:700;font-size:15px;">3</div>
                </td>
                <td style="padding-left:12px;">
                  <strong style="color:#1a1a2e;font-size:15px;">Partager votre fiche Google My Business</strong>
                  <p style="margin:4px 0 0;color:#555;font-size:13px;">Ajoutez-nous en tant que gestionnaire pour qu'on puisse lancer vos campagnes :</p>
                  <div style="margin:10px 0 0;padding:14px;background:#f8f8fc;border-radius:8px;border:1px solid #e5e5f0;">
                    <p style="margin:0 0 6px;font-size:12px;color:#7C3AED;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Mini-tuto (2 min)</p>
                    <ol style="margin:0;padding:0 0 0 18px;color:#444;font-size:13px;line-height:1.7;">
                      <li>Allez sur <a href="https://business.google.com" style="color:#7C3AED;font-weight:600;text-decoration:none;">business.google.com</a></li>
                      <li>Cliquez sur votre établissement</li>
                      <li>Dans le menu à gauche, cliquez sur <strong>\u00ab\u00a0Utilisateurs\u00a0\u00bb</strong></li>
                      <li>Cliquez sur <strong>\u00ab\u00a0Ajouter des utilisateurs\u00a0\u00bb</strong> (icône +)</li>
                      <li>Entrez l'adresse : <strong style="color:#7C3AED;">agence.celexia@gmail.com</strong></li>
                      <li>Sélectionnez le rôle <strong>\u00ab\u00a0Gestionnaire\u00a0\u00bb</strong></li>
                      <li>Cliquez sur <strong>\u00ab\u00a0Inviter\u00a0\u00bb</strong> et c'est bon !</li>
                    </ol>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 18px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="width:40px;vertical-align:top;padding-top:2px;">
                  <div style="width:32px;height:32px;border-radius:50%;background:#7C3AED;color:#fff;text-align:center;line-height:32px;font-weight:700;font-size:15px;">4</div>
                </td>
                <td style="padding-left:12px;">
                  <strong style="color:#1a1a2e;font-size:15px;">Envoyer votre assurance décennale</strong>
                  <p style="margin:4px 0 0;color:#555;font-size:13px;">Un simple scan ou photo lisible suffit.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : `
        <tr>
          <td style="padding:0 0 18px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="width:40px;vertical-align:top;padding-top:2px;">
                  <div style="width:32px;height:32px;border-radius:50%;background:#7C3AED;color:#fff;text-align:center;line-height:32px;font-weight:700;font-size:15px;">1</div>
                </td>
                <td style="padding-left:12px;">
                  <strong style="color:#1a1a2e;font-size:15px;">Signer le contrat de partenariat</strong>
                  <p style="margin:4px 0 0;color:#555;font-size:13px;">Vous le trouverez en pièce jointe de cet email. Signez-le et renvoyez-le-nous.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 18px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="width:40px;vertical-align:top;padding-top:2px;">
                  <div style="width:32px;height:32px;border-radius:50%;background:#7C3AED;color:#fff;text-align:center;line-height:32px;font-weight:700;font-size:15px;">2</div>
                </td>
                <td style="padding-left:12px;">
                  <strong style="color:#1a1a2e;font-size:15px;">Envoyer votre assurance décennale</strong>
                  <p style="margin:4px 0 0;color:#555;font-size:13px;">Un simple scan ou photo lisible suffit.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`

  const closingText = type === 'pub'
    ? `C'est tout ce dont on a besoin pour lancer la machine.<br/>Après ça, la seule chose qu'on vous demande, c'est de <strong>décrocher votre téléphone et de vendre</strong> — on s'occupe de vous amener les clients !`
    : `Une fois ces éléments reçus, on s'occupe de tout.<br/>La seule chose qu'on vous demandera ensuite, c'est de <strong>décrocher votre téléphone et de vendre</strong> !`

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f1fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f1fa;">
    <tr><td align="center" style="padding:30px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="580" style="max-width:580px;width:100%;">

        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg,#7C3AED 0%,#5B21B6 100%);border-radius:16px 16px 0 0;padding:32px 30px;text-align:center;">
            <img src="${LOGO_URL}" alt="Celexia" width="56" height="56" style="display:block;margin:0 auto 12px;border-radius:12px;"/>
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
              ${type === 'pub' ? 'Lancement de votre campagne pub' : 'Lancement de votre site web'}
            </h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">
              Celexia x ${enseigne}
            </p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="background:#ffffff;padding:32px 30px;">
            <p style="margin:0 0 20px;color:#1a1a2e;font-size:15px;line-height:1.6;">
              Bonjour ${prenom},
            </p>
            <p style="margin:0 0 24px;color:#444;font-size:15px;line-height:1.6;">
              Merci pour votre confiance ! On est ravis de travailler ensemble.
              Pour qu'on puisse démarrer rapidement, voici ce dont on a besoin de votre côté :
            </p>

            <!-- STEPS -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              ${stepsHtml}
            </table>

            <!-- CLOSING -->
            <div style="margin:24px 0 0;padding:20px;background:linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%);border-radius:12px;text-align:center;">
              <p style="margin:0;color:#1a1a2e;font-size:15px;line-height:1.6;">
                ${closingText}
              </p>
            </div>

            <p style="margin:24px 0 0;color:#444;font-size:15px;line-height:1.6;">
              À très vite,<br/>
              <strong style="color:#7C3AED;">L'équipe Celexia</strong>
            </p>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#1a1a2e;border-radius:0 0 16px 16px;padding:20px 30px;text-align:center;">
            <p style="margin:0;color:rgba(255,255,255,0.6);font-size:12px;">
              Celexia — Agence apport d'affaire
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, html }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(',')[1]) // strip "data:...;base64,"
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

interface Attachment {
  base64: string
  fileName: string
  mimeType?: string
}

async function sendDraftViaWebhook(
  to: string,
  subject: string,
  html: string,
  attachments?: Attachment[],
) {
  const payload: Record<string, unknown> = { to, subject, html }
  if (attachments && attachments.length > 0) {
    payload.attachments = attachments
  }
  const res = await fetch(N8N_EMAIL_DRAFT_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Webhook error: ${res.status}`)
  return res.json()
}

async function fetchIbanPdfBase64(): Promise<string | null> {
  try {
    const res = await fetch(IBAN_PDF_PATH)
    if (!res.ok) return null
    const blob = await res.blob()
    return blobToBase64(blob)
  } catch {
    return null
  }
}

export function ConversionDialog({
  prospect, linkedOpportunity, open, onOpenChange, onConversionDone, onOpenContract, contractCallbackRef,
}: Props) {
  const [step, setStep] = useState<Step>('choose_type')
  const [projectType, setProjectType] = useState<'site_web' | 'pub' | null>(null)
  const [budgetPub, setBudgetPub] = useState('')
  const [converting, setConverting] = useState(false)
  const [draftStatus, setDraftStatus] = useState<'idle' | 'waiting_contract' | 'sending' | 'sent' | 'error'>('idle')
  const [clientId, setClientId] = useState<string | null>(null)
  const [pendingEmail, setPendingEmail] = useState<{ subject: string; html: string } | null>(null)

  const convertProspect = useConvertProspect()
  const queryClient = useQueryClient()

  function reset() {
    setStep('choose_type')
    setProjectType(null)
    setBudgetPub('')
    setConverting(false)
    setDraftStatus('idle')
    setClientId(null)
    setPendingEmail(null)
  }

  function handleOpenChange(o: boolean) {
    if (!o) reset()
    onOpenChange(o)
  }

  async function handleConvert(type: 'site_web' | 'pub', budget?: number) {
    setConverting(true)
    try {
      // 1. Convert prospect to client
      const newClientId = await convertProspect.mutateAsync(prospect.id)
      setClientId(newClientId)

      // 2. Update opportunity with type + budget if exists
      if (linkedOpportunity) {
        const updates: Partial<Opportunity> = {
          opportunity_type: type,
          ...(type === 'pub' && budget ? { budget_pub: budget } : {}),
        }
        await updateOpportunity(linkedOpportunity.id, updates)
      }

      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
      queryClient.invalidateQueries({ queryKey: ['prospect'] })

      toast.success('Prospect converti en client !')

      // 3. Prepare email — capture values NOW to avoid stale closure
      const email = buildHtmlEmail(prospect, type, budget || 0)
      const recipientEmail = prospect.contact_email
      setPendingEmail(email)

      // 4. Open contract dialog — register callback with captured values
      if (recipientEmail) {
        setDraftStatus('waiting_contract')
        contractCallbackRef.current = async (blob: Blob, fileName: string) => {
          setDraftStatus('sending')
          try {
            const contractBase64 = await blobToBase64(blob)
            const pjList: Attachment[] = [
              { base64: contractBase64, fileName, mimeType: 'application/pdf' },
            ]
            if (type === 'pub') {
              const ibanBase64 = await fetchIbanPdfBase64()
              if (ibanBase64) {
                pjList.push({ base64: ibanBase64, fileName: 'IBAN Celexia.pdf', mimeType: 'application/pdf' })
              }
            }
            await sendDraftViaWebhook(recipientEmail, email.subject, email.html, pjList)
            setDraftStatus('sent')
            toast.success('Brouillon Gmail créé avec les PJ !')
          } catch {
            setDraftStatus('error')
          }
        }
      }
      onOpenContract()

      // 5. Move to email step
      setStep('email_ready')
    } catch {
      toast.error('Erreur lors de la conversion')
    } finally {
      setConverting(false)
    }
  }

  function handleChooseType(type: 'site_web' | 'pub') {
    setProjectType(type)
    if (type === 'pub') {
      setStep('budget_pub')
    } else {
      handleConvert(type)
    }
  }

  function handleBudgetConfirm() {
    const budget = parseFloat(budgetPub.replace(/\s/g, '').replace(',', '.'))
    if (!budget || budget <= 0) {
      toast.error('Entrez un budget valide')
      return
    }
    handleConvert('pub', budget)
  }

  async function handleSendWithoutAttachment() {
    if (!pendingEmail || !prospect.contact_email) return
    setDraftStatus('sending')
    try {
      await sendDraftViaWebhook(prospect.contact_email, pendingEmail.subject, pendingEmail.html)
      setDraftStatus('sent')
      toast.success('Brouillon Gmail créé (sans PJ)')
    } catch {
      setDraftStatus('error')
    }
  }

  function handleFinish() {
    handleOpenChange(false)
    if (clientId) {
      onConversionDone(clientId)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Step 1: Choose type */}
        {step === 'choose_type' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-emerald-600" />
                Convertir en client
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Quel type de projet pour <strong>{prospect.company_name}</strong> ?
            </p>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <Button
                variant="outline"
                className="h-24 flex-col gap-2 border-2 hover:border-blue-500 hover:bg-blue-50"
                onClick={() => handleChooseType('site_web')}
                disabled={converting}
              >
                <Globe className="h-8 w-8 text-blue-600" />
                <span className="font-semibold">Site Web</span>
              </Button>
              <Button
                variant="outline"
                className="h-24 flex-col gap-2 border-2 hover:border-orange-500 hover:bg-orange-50"
                onClick={() => handleChooseType('pub')}
                disabled={converting}
              >
                <Megaphone className="h-8 w-8 text-orange-600" />
                <span className="font-semibold">Pub (LSA)</span>
              </Button>
            </div>
            {converting && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Conversion en cours...
              </div>
            )}
          </>
        )}

        {/* Step 2: Budget pub */}
        {step === 'budget_pub' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Euro className="h-5 w-5 text-orange-600" />
                Budget publicitaire
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Combien de budget pub mensuel pour <strong>{prospect.company_name}</strong> ?
            </p>
            <div className="space-y-2 mt-2">
              <Label>Budget pub mensuel (en euros)</Label>
              <div className="relative">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={budgetPub}
                  onChange={(e) => setBudgetPub(e.target.value)}
                  placeholder="Ex: 500"
                  className="pr-8 text-lg font-semibold"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleBudgetConfirm()}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">
                  €
                </span>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="ghost" onClick={() => { setStep('choose_type'); setProjectType(null) }}>
                Retour
              </Button>
              <Button
                onClick={handleBudgetConfirm}
                disabled={converting || !budgetPub}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {converting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
                {converting ? 'Conversion...' : 'Convertir et générer contrat'}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 3: Email draft status */}
        {step === 'email_ready' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-violet-600" />
                Email de lancement
              </DialogTitle>
            </DialogHeader>

            {/* Draft status */}
            {draftStatus === 'waiting_contract' && (
              <div className="flex items-center gap-3 p-4 bg-violet-50 rounded-lg border border-violet-200">
                <Loader2 className="h-5 w-5 text-violet-600 animate-spin shrink-0" />
                <div>
                  <p className="text-sm font-medium text-violet-900">En attente du contrat...</p>
                  <p className="text-xs text-violet-600">Générez le contrat — il sera automatiquement attaché au brouillon Gmail</p>
                </div>
              </div>
            )}

            {draftStatus === 'sending' && (
              <div className="flex items-center gap-3 p-4 bg-violet-50 rounded-lg border border-violet-200">
                <Loader2 className="h-5 w-5 text-violet-600 animate-spin shrink-0" />
                <div>
                  <p className="text-sm font-medium text-violet-900">Création du brouillon en cours...</p>
                  <p className="text-xs text-violet-600">Contrat en PJ + email personnalisé</p>
                </div>
              </div>
            )}

            {draftStatus === 'sent' && (
              <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-900">Brouillon créé avec le contrat en PJ !</p>
                  <p className="text-xs text-emerald-600">
                    Ouvrez Gmail et envoyez à <strong>{prospect.contact_email}</strong>
                  </p>
                </div>
              </div>
            )}

            {draftStatus === 'error' && (
              <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900">Erreur lors de la création du brouillon</p>
                  <p className="text-xs text-red-600">Vérifiez la connexion N8N / Gmail</p>
                </div>
              </div>
            )}

            {!prospect.contact_email && (
              <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-900">Pas d'email pour ce prospect</p>
                  <p className="text-xs text-amber-600">Ajoutez un email au prospect pour envoyer automatiquement</p>
                </div>
              </div>
            )}

            {/* Email preview */}
            <div className="mt-2 space-y-3">
              <div className="rounded-lg border overflow-hidden">
                <div className="bg-gradient-to-r from-violet-600 to-violet-800 p-4 text-center">
                  <div className="inline-block w-10 h-10 rounded-lg bg-white/20 mb-2" />
                  <p className="text-white font-bold text-sm">
                    {projectType === 'pub' ? 'Lancement campagne pub' : 'Lancement site web'}
                  </p>
                  <p className="text-white/80 text-xs">Celexia x {prospect.company_name}</p>
                </div>
                <div className="p-4 bg-white text-xs text-muted-foreground space-y-2">
                  <p>Bonjour {prospect.contact_firstname || prospect.contact_name}...</p>
                  {projectType === 'pub' ? (
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Signer le contrat <span className="text-emerald-600">(en PJ)</span></li>
                      <li>Verser {parseFloat(budgetPub.replace(/\s/g, '').replace(',', '.')) || 0} € de budget pub <span className="text-emerald-600">(IBAN en PJ)</span></li>
                      <li>Partager Google My Business <span className="text-violet-600">(+ mini-tuto inclus)</span></li>
                      <li>Envoyer assurance décennale</li>
                    </ol>
                  ) : (
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Signer le contrat <span className="text-emerald-600">(en PJ)</span></li>
                      <li>Envoyer assurance décennale</li>
                    </ol>
                  )}
                  <p className="italic">"Décrochez votre téléphone et vendez !"</p>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-4 gap-2">
              {draftStatus === 'waiting_contract' && (
                <Button variant="outline" size="sm" onClick={handleSendWithoutAttachment}>
                  Créer le brouillon sans PJ
                </Button>
              )}
              {draftStatus === 'sent' && (
                <Button
                  variant="outline"
                  onClick={() => window.open('https://mail.google.com/mail/u/0/#drafts', '_blank')}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Ouvrir mes brouillons Gmail
                </Button>
              )}
              <Button onClick={handleFinish} className="bg-violet-600 hover:bg-violet-700">
                Terminer
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
