import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
// @ts-expect-error no types for file-saver
import { saveAs } from 'file-saver'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { updateOnboarding, uploadPortalDocument } from '../../services/onboarding-service'
import { ProgressHeader } from '../../components/onboarding/progress-header'
import { getNextOnboardingStep } from '../../lib/onboarding-navigation'
import { generateContract, type ContractData } from '@/features/contracts/services/contract-generator'
import { ArrowLeft, ArrowRight, FileText, Download, Eye, Loader2, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'

export function ContractPage() {
  const { onboarding, client, isLoading, refreshOnboarding } = usePortalAuth()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [signed, setSigned] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [generatingPreview, setGeneratingPreview] = useState(false)

  const contractData = (onboarding?.contract_data || {}) as Partial<ContractData>
  const hasContractData = !!contractData.client_siren && !!contractData.client_enseigne

  // Generate preview PDF (unsigned) on mount
  useEffect(() => {
    if (!hasContractData) return
    let cancelled = false
    async function gen() {
      setGeneratingPreview(true)
      try {
        const blob = await generateContract(contractData as ContractData)
        const url = URL.createObjectURL(blob)
        if (!cancelled) setPreviewUrl(url)
      } catch (err) {
        console.error('Preview generation failed:', err)
      } finally {
        if (!cancelled) setGeneratingPreview(false)
      }
    }
    gen()
    return () => {
      cancelled = true
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasContractData])

  // Canvas init
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * 2
    canvas.height = rect.height * 2
    ctx.scale(2, 2)
    ctx.strokeStyle = '#0F172A'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    let drawing = false
    let last: { x: number; y: number } | null = null

    const pos = (e: MouseEvent | TouchEvent) => {
      const r = canvas.getBoundingClientRect()
      const t = 'touches' in e ? e.touches[0] : e
      return { x: t.clientX - r.left, y: t.clientY - r.top }
    }
    const start = (e: MouseEvent | TouchEvent) => { e.preventDefault(); drawing = true; last = pos(e); setSigned(true) }
    const move = (e: MouseEvent | TouchEvent) => {
      if (!drawing || !last) return
      e.preventDefault()
      const p = pos(e)
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      last = p
    }
    const end = () => { drawing = false }

    canvas.addEventListener('mousedown', start)
    canvas.addEventListener('mousemove', move)
    window.addEventListener('mouseup', end)
    canvas.addEventListener('touchstart', start, { passive: false })
    canvas.addEventListener('touchmove', move, { passive: false })
    canvas.addEventListener('touchend', end)
    return () => {
      canvas.removeEventListener('mousedown', start)
      canvas.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', end)
      canvas.removeEventListener('touchstart', start)
      canvas.removeEventListener('touchmove', move)
      canvas.removeEventListener('touchend', end)
    }
  }, [])

  function clearCanvas() {
    const c = canvasRef.current
    if (!c) return
    c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    setSigned(false)
  }

  async function handleContinue() {
    if (!onboarding || !client || !signed || !accepted || !hasContractData) return
    setSaving(true)
    try {
      const signatureData = canvasRef.current?.toDataURL('image/png') || ''
      const signedDate = new Date().toLocaleDateString('fr-FR')

      const signedBlob = await generateContract(contractData as ContractData, {
        clientSignatureDataUrl: signatureData,
        clientSignedDate: signedDate,
      })

      const fileName = `Contrat-signe-${contractData.client_enseigne || 'client'}-${Date.now()}.pdf`
      const signedFile = new File([signedBlob], fileName, { type: 'application/pdf' })

      const path = await uploadPortalDocument(client.id, signedFile, 'contract-signed')

      saveAs(signedBlob, fileName)

      const updated = await updateOnboarding(onboarding.id, {
        contract_signed: true,
        contract_signature_data: signatureData,
        contract_signed_at: new Date().toISOString(),
        signed_contract_path: path,
        current_step: 2,
      } as Record<string, unknown>)

      await refreshOnboarding()
      toast.success('Contrat signé et téléchargé !')
      navigate(getNextOnboardingStep(updated))
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors de la signature du contrat')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || !onboarding) {
    return (
      <div>
        <ProgressHeader step={1} title="Signature du contrat d'apport d'affaires" />
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <Loader2 size={32} className="animate-spin text-violet-600" />
          <p className="text-xs text-gray-500 sm:text-sm">Chargement de votre contrat…</p>
        </div>
      </div>
    )
  }

  if (onboarding.contract_signed && onboarding.signed_contract_path) {
    async function viewSignedPdf() {
      const { data } = await supabase.storage
        .from('portal-documents')
        .createSignedUrl(onboarding!.signed_contract_path!, 3600)
      if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    }

    return (
      <div>
        <ProgressHeader step={1} title="Signature du contrat d'apport d'affaires" />
        <div className="p-card mb-6 p-6 text-center sm:p-8">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 sm:h-[72px] sm:w-[72px]">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="font-display mb-2 text-xl font-bold sm:text-2xl">
            Contrat déjà signé
          </h2>
          <p className="mx-auto mb-5 max-w-[480px] text-sm leading-relaxed text-gray-600">
            Votre contrat a été signé le {onboarding.contract_signed_at ? new Date(onboarding.contract_signed_at).toLocaleDateString('fr-FR') : '—'}.
          </p>
          <button className="btn btn-secondary" onClick={viewSignedPdf}>
            <Eye size={16} /> Voir le contrat signé
          </button>
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button className="btn btn-ghost w-full sm:w-auto" onClick={() => navigate('/portal/onboarding/welcome')}>
            <ArrowLeft size={16} /> Retour au sommaire
          </button>
          <button className="btn btn-primary lg w-full sm:w-auto" onClick={() => navigate(getNextOnboardingStep(onboarding))}>
            Étape suivante <ArrowRight size={18} />
          </button>
        </div>
      </div>
    )
  }

  if (!hasContractData) {
    return (
      <div>
        <ProgressHeader step={1} title="Signature du contrat d'apport d'affaires" />
        <div className="p-card border-amber-600 bg-amber-100 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <FileText size={20} className="mt-0.5 flex-shrink-0 text-amber-600" />
            <div>
              <div className="mb-1 text-[15px] font-semibold text-gray-900">Contrat non disponible</div>
              <div className="text-[13px] leading-relaxed text-gray-700">
                Les informations contractuelles (SIREN, enseigne…) n'ont pas été saisies par l'agence lors de votre invitation.
                Merci de contacter Celexia à <a href="mailto:agence.celexia@gmail.com" className="font-semibold text-violet-600 hover:underline">agence.celexia@gmail.com</a>.
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <ProgressHeader step={1} title="Signature du contrat d'apport d'affaires" />
      <p className="mb-6 text-sm leading-relaxed text-gray-600 sm:text-[15px]">
        Lisez attentivement votre contrat personnalisé ci-dessous, puis signez dans le cadre en bas de page.
      </p>

      {/* Contract preview */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 sm:text-[13px]">
            <Eye size={14} /> Votre contrat
          </div>
          {previewUrl && (
            <a
              href={previewUrl}
              download={`Contrat-Celexia-${contractData.client_enseigne || 'client'}.pdf`}
              className="hidden items-center gap-1 text-[11px] font-semibold text-violet-600 no-underline hover:underline sm:flex sm:text-xs"
            >
              <Download size={12} /> Télécharger
            </a>
          )}
        </div>

        {/* Mobile : boutons plein écran + télécharger (iframe inutilisable sur mobile) */}
        <div className="flex flex-col gap-2 sm:hidden">
          {generatingPreview || !previewUrl ? (
            <div className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50">
              <Loader2 size={24} className="animate-spin text-violet-600" />
              <p className="text-xs text-gray-500">Génération de votre contrat…</p>
            </div>
          ) : (
            <>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary w-full justify-center"
              >
                <Eye size={16} /> Voir le contrat en plein écran
              </a>
              <a
                href={previewUrl}
                download={`Contrat-Celexia-${contractData.client_enseigne || 'client'}.pdf`}
                className="btn btn-ghost w-full justify-center"
              >
                <Download size={16} /> Télécharger le PDF
              </a>
              <p className="mt-1 text-center text-[11px] text-gray-500">
                Le contrat s'ouvre dans le visualiseur PDF de votre téléphone.
              </p>
            </>
          )}
        </div>

        {/* Desktop : aperçu embarqué */}
        <div className="hidden h-[500px] overflow-hidden rounded-xl border border-gray-200 bg-gray-50 sm:block">
          {generatingPreview || !previewUrl ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3">
              <Loader2 size={32} className="animate-spin text-violet-600" />
              <p className="text-[13px] text-gray-500">Génération de votre contrat personnalisé…</p>
            </div>
          ) : (
            <iframe
              src={previewUrl}
              title="Contrat Celexia"
              className="h-full w-full border-0"
            />
          )}
        </div>
      </div>

      {/* Signature canvas */}
      <div className="mb-6">
        <div className="mb-2 text-xs font-semibold text-gray-700 sm:text-[13px]">
          Votre signature
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
          <canvas
            ref={canvasRef}
            className="block h-40 w-full cursor-crosshair touch-none rounded-lg border border-dashed border-gray-200 bg-white sm:h-48"
          />
        </div>
        <div className="mt-2.5 flex flex-col-reverse items-start justify-between gap-2 sm:flex-row sm:items-center">
          <span className={`text-xs ${signed ? 'text-emerald-600' : 'text-gray-500'}`}>
            {signed ? '✓ Signature enregistrée — elle sera embarquée dans le PDF final' : 'Utilisez la souris ou le doigt'}
          </span>
          <button className="btn btn-ghost" onClick={clearCanvas}>Effacer</button>
        </div>
      </div>

      {/* Accept checkbox */}
      <label className="mb-6 flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-3.5 sm:mb-7">
        <input
          type="checkbox"
          className="p-checkbox mt-0.5 flex-shrink-0"
          checked={accepted}
          onChange={e => setAccepted(e.target.checked)}
        />
        <span className="text-sm leading-snug text-gray-700">
          J'ai lu le contrat ci-dessus et j'accepte les conditions générales du contrat d'apport d'affaires Celexia.
        </span>
      </label>

      {/* Info box */}
      <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-gray-700">
        En cliquant sur <strong>Continuer</strong>, votre signature sera intégrée au PDF qui sera automatiquement téléchargé sur votre ordinateur et enregistré dans votre espace.
      </div>

      {/* Navigation */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button className="btn btn-ghost w-full sm:w-auto" onClick={() => navigate('/portal/onboarding/welcome')}>
          <ArrowLeft size={16} /> Retour
        </button>
        <button className="btn btn-primary lg w-full sm:w-auto" disabled={!signed || !accepted || saving} onClick={handleContinue}>
          {saving ? <><Loader2 size={16} className="animate-spin" /> Génération PDF…</> : <>Signer et continuer <ArrowRight size={18} /></>}
        </button>
      </div>
    </div>
  )
}
