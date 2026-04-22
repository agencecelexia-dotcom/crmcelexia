import type { PortalOnboarding } from '../hooks/use-portal-auth'

export interface StepMeta {
  num: number
  path: string
  label: string
  done: boolean
}

export function getOnboardingSteps(onb: Pick<PortalOnboarding,
  'contract_signed' | 'payment_proof_uploaded' | 'gmb_access_confirmed' |
  'rc_pro_uploaded' | 'kbis_uploaded' | 'quiz_completed_at'
>): StepMeta[] {
  return [
    { num: 1, path: '/portal/onboarding/contract', label: 'Contrat signé', done: onb.contract_signed },
    { num: 2, path: '/portal/onboarding/payment', label: 'Virement', done: onb.payment_proof_uploaded },
    { num: 3, path: '/portal/onboarding/gmb', label: 'Google Business', done: onb.gmb_access_confirmed },
    { num: 4, path: '/portal/onboarding/legal', label: 'RC Pro + Kbis', done: onb.rc_pro_uploaded && onb.kbis_uploaded },
    { num: 5, path: '/portal/onboarding/training', label: 'Formation + QCM', done: !!onb.quiz_completed_at },
  ]
}

/** Returns the path of the next incomplete step, or pending page if all done */
export function getNextOnboardingStep(onb: Pick<PortalOnboarding,
  'contract_signed' | 'payment_proof_uploaded' | 'gmb_access_confirmed' |
  'rc_pro_uploaded' | 'kbis_uploaded' | 'quiz_completed_at'
>): string {
  const steps = getOnboardingSteps(onb)
  const next = steps.find(s => !s.done)
  return next ? next.path : '/portal/onboarding/pending'
}
