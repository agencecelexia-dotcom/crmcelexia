import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { updateOnboarding, uploadPortalDocument } from '../../services/onboarding-service'
import { ProgressHeader } from '../../components/onboarding/progress-header'
import { DocUpload } from '../../components/onboarding/doc-upload'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight, Loader2, Shield } from 'lucide-react'
import { toast } from 'sonner'

export function LegalPage() {
  const { onboarding, client, refreshOnboarding } = usePortalAuth()
  const navigate = useNavigate()
  const [rcProFile, setRcProFile] = useState<File | null>(null)
  const [kbisFile, setKbisFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!onboarding || !client || !rcProFile || !kbisFile) return
    setSaving(true)
    try {
      const rcProPath = await uploadPortalDocument(client.id, rcProFile, 'rc-pro')
      const kbisPath = await uploadPortalDocument(client.id, kbisFile, 'kbis')
      await updateOnboarding(onboarding.id, {
        rc_pro_uploaded: true,
        rc_pro_path: rcProPath,
        kbis_uploaded: true,
        kbis_path: kbisPath,
        current_step: 5,
      } as Record<string, unknown>)
      await refreshOnboarding()
      toast.success('Documents enregistrés !')
      navigate('/portal/onboarding/training')
    } catch {
      toast.error('Erreur lors de l\'upload')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <ProgressHeader step={4} title="Documents légaux" subtitle="Uploadez votre assurance RC Pro et votre extrait Kbis." />

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-5 w-5 text-violet-600" />
            <h3 className="text-sm font-bold text-gray-900">Assurance RC Pro</h3>
          </div>
          <p className="text-xs text-gray-500 mb-3">Responsabilité civile professionnelle en cours de validité.</p>
          <DocUpload
            label=""
            accept=".pdf"
            file={rcProFile}
            onFileChange={setRcProFile}
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-5 w-5 text-violet-600" />
            <h3 className="text-sm font-bold text-gray-900">Extrait Kbis</h3>
          </div>
          <p className="text-xs text-gray-500 mb-3">Extrait de moins de 3 mois.</p>
          <DocUpload
            label=""
            accept=".pdf"
            file={kbisFile}
            onFileChange={setKbisFile}
          />
        </div>
      </div>

      <div className="rounded-xl border bg-gray-50 p-4 mb-8">
        <p className="text-xs text-gray-500">
          <strong>RGPD :</strong> Vos documents sont stockés de manière sécurisée et ne sont utilisés que pour vérifier la conformité de votre activité. Ils ne seront jamais partagés avec des tiers.
        </p>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => navigate('/portal/onboarding/gmb')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Retour
        </Button>
        <Button
          className="bg-violet-600 hover:bg-violet-700"
          disabled={!rcProFile || !kbisFile || saving}
          onClick={handleSubmit}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Continuer <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
