import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { updateOnboarding } from '../../services/onboarding-service'
import { ProgressHeader } from '../../components/onboarding/progress-header'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowLeft, ArrowRight, Loader2, Eraser } from 'lucide-react'
import { toast } from 'sonner'

export function ContractPage() {
  const { onboarding, refreshOnboarding } = usePortalAuth()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [saving, setSaving] = useState(false)

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = canvas.offsetWidth * 2
    canvas.height = canvas.offsetHeight * 2
    ctx.scale(2, 2)
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    setDrawing(true)
    const ctx = canvasRef.current?.getContext('2d')
    const pos = getPos(e)
    ctx?.beginPath()
    ctx?.moveTo(pos.x, pos.y)
  }, [getPos])

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    const pos = getPos(e)
    ctx?.lineTo(pos.x, pos.y)
    ctx?.stroke()
    setHasSignature(true)
  }, [drawing, getPos])

  const stopDraw = useCallback(() => setDrawing(false), [])

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  async function handleSubmit() {
    if (!onboarding || !hasSignature || !accepted) return
    setSaving(true)
    try {
      const signatureData = canvasRef.current?.toDataURL('image/png') || ''
      await updateOnboarding(onboarding.id, {
        contract_signed: true,
        contract_signature_data: signatureData,
        contract_signed_at: new Date().toISOString(),
        current_step: 2,
      } as Record<string, unknown>)
      await refreshOnboarding()
      toast.success('Contrat signé !')
      navigate('/portal/onboarding/payment')
    } catch {
      toast.error('Erreur lors de la signature')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <ProgressHeader step={1} title="Signature du contrat" subtitle="Lisez et signez le contrat de partenariat Celexia." />

      <div className="grid md:grid-cols-2 gap-6">
        {/* Signature canvas */}
        <div>
          <p className="text-sm font-semibold text-gray-900 mb-2">Votre signature</p>
          <div className="relative rounded-xl border-2 border-gray-200 bg-white overflow-hidden" style={{ touchAction: 'none' }}>
            <canvas
              ref={canvasRef}
              className="w-full cursor-crosshair"
              style={{ height: 200 }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
            />
            {!hasSignature && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-sm text-gray-400">Signez ici (souris ou doigt)</p>
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={clearCanvas} className="mt-2 text-gray-500">
            <Eraser className="mr-1.5 h-3.5 w-3.5" /> Effacer
          </Button>
        </div>

        {/* Contract preview */}
        <div className="rounded-xl border bg-gray-50 p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Contrat de partenariat Celexia</h3>
          <div className="space-y-2 text-xs text-gray-600 leading-relaxed">
            <p>Ce contrat engage le partenaire artisan et l'Agence Celexia (SASU LEIA, SIREN 939 306 429) dans le cadre d'un partenariat d'apport d'affaires.</p>
            <p><strong>Commission :</strong> 10% HT sur chaque devis signé via les leads générés par Celexia.</p>
            <p><strong>Durée :</strong> Contrat à durée indéterminée, résiliable à tout moment sans engagement minimum.</p>
            <p><strong>Confidentialité :</strong> Les données des leads sont confidentielles et ne peuvent être partagées.</p>
            <p className="text-gray-400 italic">Document complet envoyé par email lors de l'invitation.</p>
          </div>
        </div>
      </div>

      {/* Accept checkbox */}
      <div className="mt-6 flex items-start gap-3">
        <Checkbox id="accept" checked={accepted} onCheckedChange={(v) => setAccepted(!!v)} />
        <label htmlFor="accept" className="text-sm text-gray-700 cursor-pointer">
          J'ai lu et j'accepte les conditions générales du contrat de partenariat Celexia.
        </label>
      </div>

      {/* Navigation */}
      <div className="mt-8 flex justify-between">
        <Button variant="ghost" onClick={() => navigate('/portal/onboarding/welcome')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Retour
        </Button>
        <Button
          className="bg-violet-600 hover:bg-violet-700"
          disabled={!hasSignature || !accepted || saving}
          onClick={handleSubmit}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Continuer <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
