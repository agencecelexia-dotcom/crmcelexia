import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { updateOnboarding, uploadPortalDocument } from '../../services/onboarding-service'
import { ProgressHeader } from '../../components/onboarding/progress-header'
import { DocUpload } from '../../components/onboarding/doc-upload'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight, Loader2, Copy, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

const IBAN = 'FR76 1820 6004 4464 1939 4300 155'
const BIC = 'AGRIFRPP882'
const REFERENCE = 'CELEXIA-LAUNCH'

export function PaymentPage() {
  const { onboarding, client, refreshOnboarding } = usePortalAuth()
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [copiedIban, setCopiedIban] = useState(false)

  function copyIban() {
    navigator.clipboard.writeText(IBAN.replace(/\s/g, ''))
    setCopiedIban(true)
    toast.success('IBAN copié !')
    setTimeout(() => setCopiedIban(false), 2000)
  }

  async function handleSubmit() {
    if (!onboarding || !file || !client) return
    setSaving(true)
    try {
      const path = await uploadPortalDocument(client.id, file, 'payment-proof')
      await updateOnboarding(onboarding.id, {
        payment_proof_uploaded: true,
        payment_proof_path: path,
        current_step: 3,
      } as Record<string, unknown>)
      await refreshOnboarding()
      toast.success('Preuve de paiement enregistrée !')
      navigate('/portal/onboarding/gmb')
    } catch {
      toast.error('Erreur lors de l\'upload')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <ProgressHeader step={2} title="Preuve de paiement" subtitle="Effectuez le virement de votre budget publicitaire et uploadez le justificatif." />

      {/* IBAN card */}
      <div className="rounded-xl border bg-violet-50 border-violet-200 p-5 mb-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 mb-1">IBAN</p>
              <p className="font-mono text-sm font-semibold text-gray-900">{IBAN}</p>
            </div>
            <Button variant="outline" size="sm" onClick={copyIban} className="shrink-0">
              {copiedIban ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-600" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
              {copiedIban ? 'Copié' : 'Copier'}
            </Button>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 mb-1">BIC</p>
            <p className="font-mono text-sm text-gray-700">{BIC}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 mb-1">Référence du virement</p>
            <p className="font-mono text-sm font-semibold text-violet-700">{REFERENCE}</p>
          </div>
        </div>
      </div>

      {/* Upload */}
      <DocUpload
        label="Justificatif de virement"
        subtitle="Capture d'écran ou PDF de confirmation de votre banque"
        file={file}
        onFileChange={setFile}
      />

      {/* Navigation */}
      <div className="mt-8 flex justify-between">
        <Button variant="ghost" onClick={() => navigate('/portal/onboarding/contract')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Retour
        </Button>
        <Button
          className="bg-violet-600 hover:bg-violet-700"
          disabled={!file || saving}
          onClick={handleSubmit}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Continuer <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
