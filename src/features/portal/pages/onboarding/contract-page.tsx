import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { updateOnboarding } from '../../services/onboarding-service'
import { ProgressHeader } from '../../components/onboarding/progress-header'
import { ArrowLeft, ArrowRight, FileText } from 'lucide-react'
import { toast } from 'sonner'

export function ContractPage() {
  const { onboarding, refreshOnboarding } = usePortalAuth()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [signed, setSigned] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [saving, setSaving] = useState(false)

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
    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      drawing = true
      last = pos(e)
      setSigned(true)
    }
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

  function clear() {
    const c = canvasRef.current
    if (!c) return
    c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    setSigned(false)
  }

  async function handleContinue() {
    if (!onboarding || !signed || !accepted) return
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
      navigate('/portal/onboarding/payment')
    } catch {
      toast.error('Erreur lors de la signature')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <ProgressHeader step={1} title="Signature du contrat d'apport d'affaires" />
      <p style={{ fontSize: 15, color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: 24 }}>
        Ce contrat formalise les 10 % de commission prélevés sur chaque devis signé généré via vos campagnes.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 240px', gap: 20, marginBottom: 24 }}>
        {/* Signature canvas */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 8 }}>
            Signez dans le cadre ci-dessous
          </div>
          <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 12, padding: 8, boxShadow: 'var(--shadow-soft)' }}>
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: 200, display: 'block', background: 'white', borderRadius: 8, cursor: 'crosshair', border: '1px dashed var(--gray-200)', touchAction: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>
              {signed ? '✓ Signature enregistrée' : 'Utilisez la souris ou le doigt'}
            </span>
            <button className="btn btn-ghost" onClick={clear}>Effacer</button>
          </div>
        </div>

        {/* Contract preview */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 8 }}>Aperçu du contrat</div>
          <div className="p-card p-card-hoverable" style={{ padding: 16, cursor: 'pointer' }}>
            <div style={{ aspectRatio: '3/4', background: 'var(--gray-50)', borderRadius: 8, border: '1px solid var(--gray-200)', display: 'flex', flexDirection: 'column', padding: 14, gap: 4 }}>
              <div style={{ height: 8, background: 'var(--gray-300)', borderRadius: 2, width: '60%' }} />
              <div style={{ height: 4, background: 'var(--gray-200)', borderRadius: 2, width: '90%', marginTop: 4 }} />
              <div style={{ height: 4, background: 'var(--gray-200)', borderRadius: 2, width: '85%' }} />
              <div style={{ height: 4, background: 'var(--gray-200)', borderRadius: 2, width: '70%' }} />
              <div style={{ height: 4, background: 'var(--gray-200)', borderRadius: 2, width: '88%', marginTop: 8 }} />
              <div style={{ height: 4, background: 'var(--gray-200)', borderRadius: 2, width: '45%' }} />
              <div style={{ flex: 1 }} />
              <div style={{ height: 24, border: '1px dashed var(--violet-300)', borderRadius: 4, background: 'var(--violet-50)' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--violet-600)', fontWeight: 600, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileText size={14} /> Contrat_Celexia_v2.pdf
            </div>
          </div>
        </div>
      </div>

      {/* Accept checkbox */}
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: 14, background: 'white', border: '1px solid var(--gray-200)', borderRadius: 10, marginBottom: 28 }}>
        <input type="checkbox" className="p-checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />
        <span style={{ fontSize: 14, color: 'var(--gray-700)', lineHeight: 1.5 }}>
          J'ai lu et j'accepte les{' '}
          <span style={{ color: 'var(--violet-600)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>conditions générales</span>{' '}
          du contrat d'apport d'affaires Celexia.
        </span>
      </label>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn btn-ghost" onClick={() => navigate('/portal/onboarding/welcome')}>
          <ArrowLeft size={16} /> Retour
        </button>
        <button className="btn btn-primary lg" disabled={!signed || !accepted || saving} onClick={handleContinue}>
          {saving ? 'Enregistrement...' : 'Continuer'} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}
