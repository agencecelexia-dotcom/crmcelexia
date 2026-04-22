import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
// @ts-expect-error no types for file-saver
import { saveAs } from 'file-saver'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { updateOnboarding, uploadPortalDocument } from '../../services/onboarding-service'
import { ProgressHeader } from '../../components/onboarding/progress-header'
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

      // Generate signed PDF (with client signature embedded)
      const signedBlob = await generateContract(contractData as ContractData, {
        clientSignatureDataUrl: signatureData,
        clientSignedDate: signedDate,
      })

      // Convert to File for upload
      const fileName = `Contrat-signe-${contractData.client_enseigne || 'client'}-${Date.now()}.pdf`
      const signedFile = new File([signedBlob], fileName, { type: 'application/pdf' })

      // Upload to Storage
      const path = await uploadPortalDocument(client.id, signedFile, 'contract-signed')

      // Download locally for the artisan
      saveAs(signedBlob, fileName)

      // Update onboarding
      await updateOnboarding(onboarding.id, {
        contract_signed: true,
        contract_signature_data: signatureData,
        contract_signed_at: new Date().toISOString(),
        signed_contract_path: path,
        current_step: 2,
      } as Record<string, unknown>)

      await refreshOnboarding()
      toast.success('Contrat signé et téléchargé !')
      navigate('/portal/onboarding/payment')
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors de la signature du contrat')
    } finally {
      setSaving(false)
    }
  }

  // Still loading onboarding — show loader (prevents "contract not available" flash)
  if (isLoading || !onboarding) {
    return (
      <div>
        <ProgressHeader step={1} title="Signature du contrat d'apport d'affaires" />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 12 }}>
          <Loader2 size={32} style={{ color: 'var(--violet-600)', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>Chargement de votre contrat...</p>
        </div>
      </div>
    )
  }

  // Contrat déjà signé — écran "déjà fait" avec bouton voir PDF + continuer
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
        <div className="p-card" style={{ padding: 32, textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--emerald-100)', color: 'var(--emerald-600)', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={36} />
          </div>
          <h2 className="font-display" style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
            Contrat déjà signé
          </h2>
          <p style={{ fontSize: 14, color: 'var(--gray-600)', marginBottom: 20, maxWidth: 480, margin: '0 auto 20px', lineHeight: 1.6 }}>
            Votre contrat a été signé le {onboarding.contract_signed_at ? new Date(onboarding.contract_signed_at).toLocaleDateString('fr-FR') : '—'}.
          </p>
          <button className="btn btn-secondary" onClick={viewSignedPdf} style={{ marginBottom: 8 }}>
            <Eye size={16} /> Voir le contrat signé
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/portal/onboarding/welcome')}>
            <ArrowLeft size={16} /> Retour au sommaire
          </button>
          <button className="btn btn-primary lg" onClick={() => navigate('/portal/onboarding/payment')}>
            Étape suivante <ArrowRight size={18} />
          </button>
        </div>
      </div>
    )
  }

  // Missing contract data — show error
  if (!hasContractData) {
    return (
      <div>
        <ProgressHeader step={1} title="Signature du contrat d'apport d'affaires" />
        <div className="p-card" style={{ padding: 24, background: 'var(--amber-100)', border: '1px solid var(--amber-600)' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <FileText size={20} style={{ color: 'var(--amber-600)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-900)', marginBottom: 4 }}>Contrat non disponible</div>
              <div style={{ fontSize: 13, color: 'var(--gray-700)', lineHeight: 1.55 }}>
                Les informations contractuelles (SIREN, enseigne...) n'ont pas été saisies par l'agence lors de votre invitation.
                Merci de contacter Celexia à <a href="mailto:agence.celexia@gmail.com" style={{ color: 'var(--violet-600)', fontWeight: 600 }}>agence.celexia@gmail.com</a>.
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
      <p style={{ fontSize: 15, color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: 24 }}>
        Lisez attentivement votre contrat personnalisé ci-dessous, puis signez dans le cadre en bas de page.
      </p>

      {/* Contract preview */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Eye size={14} /> Aperçu de votre contrat
          </div>
          {previewUrl && (
            <a
              href={previewUrl}
              download={`Contrat-Celexia-${contractData.client_enseigne || 'client'}.pdf`}
              style={{ fontSize: 12, color: 'var(--violet-600)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Download size={12} /> Télécharger l'aperçu
            </a>
          )}
        </div>
        <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 12, overflow: 'hidden', height: 500 }}>
          {generatingPreview || !previewUrl ? (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <Loader2 size={32} style={{ color: 'var(--violet-600)', animation: 'spin 1s linear infinite' }} />
              <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>Génération de votre contrat personnalisé...</p>
            </div>
          ) : (
            <iframe
              src={previewUrl}
              title="Contrat Celexia"
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          )}
        </div>
      </div>

      {/* Signature canvas */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 8 }}>
          Votre signature
        </div>
        <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 12, padding: 8, boxShadow: 'var(--shadow-soft)' }}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: 200, display: 'block', background: 'white', borderRadius: 8, cursor: 'crosshair', border: '1px dashed var(--gray-200)', touchAction: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontSize: 12, color: signed ? 'var(--emerald-600)' : 'var(--gray-500)' }}>
            {signed ? '✓ Signature enregistrée — elle sera embarquée dans le PDF final' : 'Utilisez la souris ou le doigt'}
          </span>
          <button className="btn btn-ghost" onClick={clearCanvas}>Effacer</button>
        </div>
      </div>

      {/* Accept checkbox */}
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: 14, background: 'white', border: '1px solid var(--gray-200)', borderRadius: 10, marginBottom: 28 }}>
        <input type="checkbox" className="p-checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />
        <span style={{ fontSize: 14, color: 'var(--gray-700)', lineHeight: 1.5 }}>
          J'ai lu le contrat ci-dessus et j'accepte les conditions générales du contrat d'apport d'affaires Celexia.
        </span>
      </label>

      {/* Info box */}
      <div style={{ padding: 12, background: 'var(--violet-50)', border: '1px solid var(--violet-200)', borderRadius: 10, marginBottom: 24, fontSize: 12, color: 'var(--gray-700)' }}>
        En cliquant sur <strong>Continuer</strong>, votre signature sera intégrée au PDF qui sera automatiquement téléchargé sur votre ordinateur et enregistré dans votre espace.
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn btn-ghost" onClick={() => navigate('/portal/onboarding/welcome')}>
          <ArrowLeft size={16} /> Retour
        </button>
        <button className="btn btn-primary lg" disabled={!signed || !accepted || saving} onClick={handleContinue}>
          {saving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Génération PDF...</> : <>Signer et continuer <ArrowRight size={18} /></>}
        </button>
      </div>
    </div>
  )
}
