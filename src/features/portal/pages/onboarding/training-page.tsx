import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../../hooks/use-portal-auth'
import { updateOnboarding, completeOnboarding } from '../../services/onboarding-service'
import { ProgressHeader } from '../../components/onboarding/progress-header'
import { QUIZ_QUESTIONS, QUIZ_PASS_SCORE } from '../../lib/quiz-questions'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, ArrowRight, Loader2, Play, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'

const PLACEHOLDER_VIDEO_URL = 'https://www.youtube.com/embed/dQw4w9WgXcQ' // placeholder — Thomas tournera la vidéo

export function TrainingPage() {
  const { onboarding, refreshOnboarding } = usePortalAuth()
  const navigate = useNavigate()
  const [videoWatched, setVideoWatched] = useState(false)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)

  const score = submitted
    ? QUIZ_QUESTIONS.reduce((s, q, i) => s + (answers[i] === q.correctIndex ? 1 : 0), 0)
    : null

  const passed = score !== null && score >= QUIZ_PASS_SCORE
  const allAnswered = Object.keys(answers).length === QUIZ_QUESTIONS.length

  function handleSubmitQuiz() {
    setSubmitted(true)
    const s = QUIZ_QUESTIONS.reduce((acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0), 0)
    if (s >= QUIZ_PASS_SCORE) {
      toast.success(`Quiz réussi ! ${s}/${QUIZ_QUESTIONS.length}`)
    } else {
      toast.error(`Score insuffisant : ${s}/${QUIZ_QUESTIONS.length}. Il faut au moins ${QUIZ_PASS_SCORE}/${QUIZ_QUESTIONS.length}.`)
    }
  }

  function handleRetry() {
    setAnswers({})
    setSubmitted(false)
  }

  async function handleContinue() {
    if (!onboarding || !passed) return
    setSaving(true)
    try {
      await updateOnboarding(onboarding.id, {
        training_video_watched: true,
        training_video_watched_at: new Date().toISOString(),
        quiz_score: score,
        quiz_answers: answers,
        quiz_completed_at: new Date().toISOString(),
      } as Record<string, unknown>)
      await completeOnboarding(onboarding.id)
      await refreshOnboarding()
      toast.success('Formation terminée !')
      navigate('/portal/onboarding/pending')
    } catch {
      toast.error('Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <ProgressHeader step={5} title="Formation + QCM" subtitle="Regardez la vidéo de prise en main du CRM puis répondez à 5 questions." />

      {/* Video */}
      <div className="mb-6">
        <div className="aspect-video rounded-xl overflow-hidden bg-gray-900 relative">
          {!videoWatched ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <button
                onClick={() => setVideoWatched(true)}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-600 hover:bg-violet-700 transition-colors mb-4"
              >
                <Play className="h-7 w-7 ml-1" />
              </button>
              <p className="text-sm font-semibold">Prise en main du CRM Celexia</p>
              <p className="text-xs text-gray-400 mt-1">~10 min · Thomas Aubigeon</p>
            </div>
          ) : (
            <iframe
              src={PLACEHOLDER_VIDEO_URL}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="Formation CRM Celexia"
            />
          )}
        </div>
      </div>

      {/* Quiz */}
      {videoWatched && (
        <div className="space-y-5 mb-8">
          <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
            QCM — Vérification de compréhension
          </h2>
          <p className="text-sm text-gray-500">Répondez aux 5 questions. Score minimum : {QUIZ_PASS_SCORE}/{QUIZ_QUESTIONS.length}</p>

          {QUIZ_QUESTIONS.map((q, qi) => {
            const isCorrect = submitted && answers[qi] === q.correctIndex
            const isWrong = submitted && answers[qi] !== undefined && answers[qi] !== q.correctIndex

            return (
              <Card key={qi} className={submitted ? (isCorrect ? 'border-emerald-300 bg-emerald-50/50' : isWrong ? 'border-red-300 bg-red-50/50' : '') : ''}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2 mb-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                      {qi + 1}
                    </span>
                    <p className="text-sm font-semibold text-gray-900">{q.question}</p>
                  </div>
                  <RadioGroup
                    value={answers[qi]?.toString()}
                    onValueChange={(v) => !submitted && setAnswers(prev => ({ ...prev, [qi]: parseInt(v) }))}
                    disabled={submitted}
                    className="space-y-2 ml-8"
                  >
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <RadioGroupItem value={oi.toString()} id={`q${qi}-o${oi}`} />
                        <Label htmlFor={`q${qi}-o${oi}`} className="text-sm text-gray-700 cursor-pointer font-normal">
                          {opt}
                        </Label>
                        {submitted && oi === q.correctIndex && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                        {submitted && oi === answers[qi] && oi !== q.correctIndex && <XCircle className="h-4 w-4 text-red-500" />}
                      </div>
                    ))}
                  </RadioGroup>
                </CardContent>
              </Card>
            )
          })}

          {/* Score result */}
          {submitted && score !== null && (
            <div className={`rounded-xl p-4 text-center ${passed ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
              <p className={`text-lg font-bold ${passed ? 'text-emerald-700' : 'text-red-700'}`}>
                {score}/{QUIZ_QUESTIONS.length}
              </p>
              <p className={`text-sm ${passed ? 'text-emerald-600' : 'text-red-600'}`}>
                {passed ? 'Bravo, quiz réussi !' : `Score insuffisant. Il faut au moins ${QUIZ_PASS_SCORE}/${QUIZ_QUESTIONS.length}.`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => navigate('/portal/onboarding/legal')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Retour
        </Button>

        {!submitted && videoWatched && (
          <Button className="bg-violet-600 hover:bg-violet-700" disabled={!allAnswered} onClick={handleSubmitQuiz}>
            Valider le QCM
          </Button>
        )}

        {submitted && !passed && (
          <Button variant="outline" onClick={handleRetry}>Réessayer</Button>
        )}

        {passed && (
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={handleContinue}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Terminer l'onboarding <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
