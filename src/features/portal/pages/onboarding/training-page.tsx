import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { updateOnboarding } from '../../services/onboarding-service'
import { ProgressHeader } from '../../components/onboarding/progress-header'
import { QUIZ_QUESTIONS, QUIZ_PASS_SCORE } from '../../lib/quiz-questions'
import { ArrowLeft, ArrowRight, Play, Check } from 'lucide-react'
import { toast } from 'sonner'

export function TrainingPage() {
  const { onboarding, refreshOnboarding } = usePortalAuth()
  const navigate = useNavigate()
  const [watched, setWatched] = useState(false)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)

  const allAnswered = QUIZ_QUESTIONS.every((_, i) => answers[i] !== undefined)
  const score = submitted ? QUIZ_QUESTIONS.reduce((s, q, i) => s + (answers[i] === q.correctIndex ? 1 : 0), 0) : null
  const alreadyCompleted = !!onboarding?.quiz_completed_at

  async function handleResubmit() {
    if (!onboarding) return
    setSaving(true)
    try {
      await updateOnboarding(onboarding.id, {
        status: 'pending_validation',
        completed_at: new Date().toISOString(),
        rejection_reason: null,
      } as Record<string, unknown>)
      await refreshOnboarding()
      navigate('/portal/onboarding/pending')
    } catch {
      toast.error('Erreur')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitAndContinue() {
    if (!onboarding) return
    const s = QUIZ_QUESTIONS.reduce((acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0), 0)
    setSubmitted(true)

    if (s < QUIZ_PASS_SCORE) {
      toast.error(`Score insuffisant : ${s}/${QUIZ_QUESTIONS.length}. Il faut au moins ${QUIZ_PASS_SCORE}.`)
      return
    }

    setSaving(true)
    try {
      await updateOnboarding(onboarding.id, {
        training_video_watched: true,
        training_video_watched_at: new Date().toISOString(),
        quiz_score: s,
        quiz_answers: answers,
        quiz_completed_at: new Date().toISOString(),
        status: 'pending_validation',
        completed_at: new Date().toISOString(),
      } as Record<string, unknown>)
      await refreshOnboarding()
      navigate('/portal/onboarding/pending')
    } catch {
      toast.error('Erreur')
    } finally {
      setSaving(false)
    }
  }

  // Quiz déjà complété → resoumettre directement (cas corrections ou retour navigation)
  if (alreadyCompleted && !submitted) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <ProgressHeader step={5} />
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--emerald-100)', color: 'var(--emerald-600)', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={40} />
        </div>
        <h1 className="font-display" style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
          Formation déjà validée
        </h1>
        <p style={{ fontSize: 15, color: 'var(--gray-600)', marginBottom: 8, maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
          Score : <strong>{onboarding?.quiz_score}/{QUIZ_QUESTIONS.length}</strong>
        </p>
        <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 28, maxWidth: 520, margin: '0 auto 28px', lineHeight: 1.6 }}>
          Soumettez votre onboarding à Celexia pour validation.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/portal/onboarding/welcome')}>
            <ArrowLeft size={16} /> Retour
          </button>
          <button className="btn btn-primary lg" disabled={saving} onClick={handleResubmit}>
            {saving ? 'Envoi...' : 'Soumettre pour validation'} <ArrowRight size={18} />
          </button>
        </div>
      </div>
    )
  }

  // Success screen after submit
  if (submitted && score !== null && score >= QUIZ_PASS_SCORE) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <ProgressHeader step={5} />
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--emerald-100)', color: 'var(--emerald-600)', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={40} />
        </div>
        <h1 className="font-display" style={{ fontSize: 32, fontWeight: 700, marginBottom: 12 }}>Onboarding terminé</h1>
        <p style={{ fontSize: 16, color: 'var(--gray-600)', marginBottom: 28, maxWidth: 480, margin: '0 auto 28px', lineHeight: 1.6 }}>
          Thomas ou Antoine valide votre compte sous 24 h. Vous recevrez un email dès le lancement de vos campagnes.
        </p>
        <button className="btn btn-primary lg" onClick={() => navigate('/portal/onboarding/pending')}>
          Voir le statut <ArrowRight size={18} />
        </button>
      </div>
    )
  }

  return (
    <div>
      <ProgressHeader step={5} title="Formation Celexia : prise en main du CRM" />

      {/* Video player */}
      <div
        style={{ position: 'relative', aspectRatio: '16/9', background: 'linear-gradient(135deg, #1E1B2E, #0F0D1E)', borderRadius: 16, overflow: 'hidden', marginBottom: 20, cursor: 'pointer' }}
        onClick={() => setWatched(true)}
      >
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: watched ? 'var(--emerald-500)' : 'var(--violet-600)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}>
            {watched ? <Check size={32} /> : <Play size={28} />}
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 16, left: 20, color: 'white' }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2 }}>10:24 · Thomas Aubigeon</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Prise en main du CRM Celexia : suivre vos leads au quotidien</div>
        </div>
        <div style={{ position: 'absolute', top: 16, right: 16, padding: '4px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: 11, fontWeight: 600, backdropFilter: 'blur(6px)' }}>
          {watched ? 'VU' : 'HD'}
        </div>
      </div>

      {/* Quiz */}
      {watched && (
        <div>
          <h2 className="font-display" style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 6 }}>Quiz de validation</h2>
          <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 20 }}>5 questions pour vérifier votre compréhension de la vidéo.</p>
          <div style={{ display: 'grid', gap: 14, marginBottom: 28 }}>
            {QUIZ_QUESTIONS.map((q, i) => (
              <div className="p-card" key={i} style={{ padding: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-900)', marginBottom: 12 }}>
                  <span style={{ color: 'var(--violet-600)', marginRight: 8 }}>Q{i + 1}.</span>{q.question}
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {q.options.map((opt, j) => (
                    <label key={j} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: 10,
                      border: `1px solid ${answers[i] === j ? 'var(--violet-400)' : 'var(--gray-200)'}`,
                      borderRadius: 8, cursor: submitted ? 'default' : 'pointer',
                      background: answers[i] === j ? 'var(--violet-50)' : 'white',
                      transition: 'all 0.15s',
                    }}>
                      <input
                        type="radio"
                        name={`q${i}`}
                        checked={answers[i] === j}
                        onChange={() => !submitted && setAnswers(a => ({ ...a, [i]: j }))}
                        disabled={submitted}
                        style={{ accentColor: 'var(--violet-600)' }}
                      />
                      <span style={{ fontSize: 13, color: 'var(--gray-700)' }}>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Error message if failed */}
          {submitted && score !== null && score < QUIZ_PASS_SCORE && (
            <div style={{ padding: 16, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, marginBottom: 20, textAlign: 'center' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#B91C1C' }}>
                Score : {score}/{QUIZ_QUESTIONS.length} — Il faut au moins {QUIZ_PASS_SCORE}/{QUIZ_QUESTIONS.length}
              </p>
              <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => { setSubmitted(false); setAnswers({}) }}>
                Réessayer
              </button>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn btn-ghost" onClick={() => navigate('/portal/onboarding/legal')}><ArrowLeft size={16} /> Retour</button>
            <button className="btn btn-primary lg" disabled={!allAnswered || saving} onClick={handleSubmitAndContinue}>
              {saving ? 'Validation...' : 'Valider mes réponses'} <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}
      {!watched && (
        <div style={{ textAlign: 'center', color: 'var(--gray-500)', fontSize: 13, marginTop: 10 }}>
          Le quiz apparaîtra après lecture complète de la vidéo.
        </div>
      )}
    </div>
  )
}
