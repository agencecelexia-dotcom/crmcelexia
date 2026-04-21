import { useState } from 'react'
import { usePendingOnboardings, useValidateOnboarding, useRejectOnboarding, useToggleReminders } from '../hooks/use-admin-onboardings'
import type { AdminOnboardingRow } from '../services/admin-onboarding-service'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { supabase } from '@/lib/supabase/client'
import {
  CheckCircle2, AlertCircle, Clock, XCircle, Loader2, FileText,
  Shield, Globe, Play, Users, Eye, BellOff,
} from 'lucide-react'
import { formatDate } from '@/lib/format'

const STEPS = [
  { key: 'contract_signed', label: 'Contrat signé', icon: FileText },
  { key: 'payment_proof_uploaded', label: 'Virement reçu', icon: FileText },
  { key: 'gmb_access_confirmed', label: 'Google Business invité', icon: Globe },
  { key: 'rc_pro_uploaded', label: 'RC Pro envoyée', icon: Shield },
  { key: 'kbis_uploaded', label: 'Kbis envoyé', icon: Shield },
  { key: 'quiz_completed_at', label: 'Formation validée', icon: Play },
] as const

function StepIndicator({ done, warn }: { done: boolean; warn?: boolean }) {
  if (done) return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  if (warn) return <AlertCircle className="h-4 w-4 text-amber-500" />
  return <Clock className="h-4 w-4 text-gray-300" />
}

function OnboardingCard({ onb, onValidate, onReject, onToggleReminders }: {
  onb: AdminOnboardingRow
  onValidate: () => void
  onReject: (reason: string) => void
  onToggleReminders: (disabled: boolean) => void
}) {
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)

  const client = onb.client
  const fullName = [client.contact_firstname, client.contact_name].filter(Boolean).join(' ') || client.company_name
  const initials = fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  const stepsDone = STEPS.filter(s => {
    const val = (onb as Record<string, unknown>)[s.key]
    return val === true || (typeof val === 'string' && val.length > 0)
  }).length

  const isPendingValidation = onb.status === 'pending_validation'

  return (
    <>
      <Card className={isPendingValidation ? 'border-violet-200 bg-violet-50/30' : ''}>
        <CardContent className="pt-5">
          {/* Header */}
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-violet-600 text-sm font-bold text-white">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{fullName}</p>
              <p className="text-xs text-gray-500">{client.company_name} · {client.city || 'Ville non renseignée'}</p>
              <p className="text-xs text-gray-400 mt-0.5">Soumis {formatDate(onb.completed_at || onb.updated_at)}</p>
            </div>
            <Badge className={isPendingValidation ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'}>
              {isPendingValidation ? 'À valider' : 'En cours'}
            </Badge>
          </div>

          {/* Step indicators */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
            {STEPS.map(({ key, label }) => {
              const val = (onb as Record<string, unknown>)[key]
              const done = val === true || (typeof val === 'string' && val.length > 0)
              return (
                <div key={key} className="flex items-center gap-1.5">
                  <StepIndicator done={done} />
                  <span className="text-xs text-gray-600 truncate">{label}</span>
                </div>
              )
            })}
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-violet-600 rounded-full transition-all" style={{ width: `${(stepsDone / STEPS.length) * 100}%` }} />
            </div>
            <span className="text-xs font-medium text-gray-500">{stepsDone}/{STEPS.length}</span>
          </div>

          {/* Reminders toggle */}
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <BellOff className="h-3.5 w-3.5" />
              Relances auto ({onb.reminder_count} envoyées)
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{onb.reminders_disabled ? 'Désactivées' : 'Activées'}</span>
              <Switch
                checked={!onb.reminders_disabled}
                onCheckedChange={(checked) => onToggleReminders(!checked)}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setDetailOpen(true)}>
              <Eye className="mr-1.5 h-3.5 w-3.5" /> Détail
            </Button>
            {isPendingValidation && (
              <>
                <Button variant="outline" size="sm" className="text-amber-700 border-amber-300 hover:bg-amber-50" onClick={() => setRejectOpen(true)}>
                  Corrections
                </Button>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={onValidate}>
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Valider
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Detail modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Détail onboarding — {client.company_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-gray-500">Contact :</span> {fullName}</div>
              <div><span className="text-gray-500">Email :</span> {client.contact_email || '—'}</div>
              <div><span className="text-gray-500">Tél :</span> {client.phone}</div>
              <div><span className="text-gray-500">Métier :</span> {client.profession || '—'}</div>
            </div>
            <div className="border-t pt-3 space-y-2">
              {STEPS.map(({ key, label, icon: Icon }) => {
                const val = (onb as Record<string, unknown>)[key]
                const done = val === true || (typeof val === 'string' && val.length > 0)
                return (
                  <div key={key} className="flex items-center gap-2">
                    <StepIndicator done={done} />
                    <Icon className="h-4 w-4 text-gray-400" />
                    <span className={done ? 'text-gray-900' : 'text-gray-400'}>{label}</span>
                  </div>
                )
              })}
            </div>
            {onb.quiz_score !== null && (
              <div className="border-t pt-3">
                <span className="text-gray-500">Score QCM :</span> <strong>{onb.quiz_score}/5</strong>
              </div>
            )}
            {onb.payment_amount && (
              <div>
                <span className="text-gray-500">Budget pub :</span> <strong>{onb.payment_amount} €</strong>
              </div>
            )}
            {/* Doc preview buttons */}
            <div className="border-t pt-3 grid grid-cols-2 gap-2">
              {[
                { label: 'RC Pro', path: onb.rc_pro_path },
                { label: 'Kbis', path: onb.kbis_path },
                { label: 'Preuve paiement', path: onb.payment_proof_path },
              ].map(({ label, path }) => path ? (
                <Button key={label} variant="outline" size="sm" onClick={async () => {
                  const { data } = await supabase.storage.from('portal-documents').createSignedUrl(path, 3600)
                  if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                }}>
                  <Eye className="mr-1.5 h-3.5 w-3.5" /> {label}
                </Button>
              ) : null)}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Demander des corrections</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Motif des corrections *</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Ex: La RC Pro est expirée, merci de renvoyer un document à jour."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRejectOpen(false); setRejectReason('') }}>Annuler</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              disabled={!rejectReason.trim()}
              onClick={() => { onReject(rejectReason); setRejectOpen(false); setRejectReason('') }}
            >
              Envoyer les corrections
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function AdminOnboardingsPage() {
  const { profile } = useAuth()
  const { data: onboardings, isLoading } = usePendingOnboardings()
  const validate = useValidateOnboarding()
  const reject = useRejectOnboarding()
  const toggleReminders = useToggleReminders()

  const pending = (onboardings ?? []).filter(o => o.status === 'pending_validation')
  const inProgress = (onboardings ?? []).filter(o => o.status === 'in_progress')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Validations onboarding</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {pending.length} à valider · {inProgress.length} en cours
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-violet-700">{pending.length}</p>
            <p className="text-xs text-gray-500">À valider</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{inProgress.length}</p>
            <p className="text-xs text-gray-500">En cours</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-gray-400">{(onboardings ?? []).length}</p>
            <p className="text-xs text-gray-500">Total</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Pending validation first */}
          {pending.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-violet-700 uppercase tracking-wider">À valider</h2>
              {pending.map(onb => (
                <OnboardingCard
                  key={onb.id}
                  onb={onb}
                  onValidate={() => validate.mutate({ id: onb.id, validatedBy: profile!.id })}
                  onReject={(reason) => reject.mutate({ id: onb.id, reason })}
                  onToggleReminders={(disabled) => toggleReminders.mutate({ id: onb.id, disabled })}
                />
              ))}
            </div>
          )}

          {/* In progress */}
          {inProgress.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">En cours</h2>
              {inProgress.map(onb => (
                <OnboardingCard
                  key={onb.id}
                  onb={onb}
                  onValidate={() => {}}
                  onReject={() => {}}
                  onToggleReminders={(disabled) => toggleReminders.mutate({ id: onb.id, disabled })}
                />
              ))}
            </div>
          )}

          {(onboardings ?? []).length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Aucun onboarding en attente</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
