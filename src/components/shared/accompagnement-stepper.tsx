import { Check, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateShort } from '@/lib/format'
import {
  ACCOMPAGNEMENT_STEPS_ORDER,
  ACCOMPAGNEMENT_STEP_LABELS,
  type AccompagnementStep,
} from '@/types/enums'
import type { ClientAccompagnementStep } from '@/types'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface AccompagnementStepperProps {
  steps: ClientAccompagnementStep[]
  variant?: 'detailed' | 'compact'
  onStepClick?: (step: ClientAccompagnementStep) => void
}

/**
 * Returns the steps in canonical order; missing steps are skipped (defensive).
 */
function orderedSteps(steps: ClientAccompagnementStep[]): ClientAccompagnementStep[] {
  const byKey = new Map<AccompagnementStep, ClientAccompagnementStep>()
  steps.forEach(s => byKey.set(s.step, s))
  return ACCOMPAGNEMENT_STEPS_ORDER.map(k => byKey.get(k)).filter(
    (s): s is ClientAccompagnementStep => !!s,
  )
}

function findCurrentIndex(steps: ClientAccompagnementStep[]): number {
  // First step that is NOT completed
  const idx = steps.findIndex(s => !s.completed_at)
  return idx === -1 ? steps.length : idx // steps.length means "all done"
}

export function AccompagnementStepper({
  steps,
  variant = 'detailed',
  onStepClick,
}: AccompagnementStepperProps) {
  const ordered = orderedSteps(steps)
  const currentIdx = findCurrentIndex(ordered)

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-1.5">
        {ordered.map((s, i) => {
            const isDone = !!s.completed_at
            const isCurrent = i === currentIdx
            return (
              <Tooltip key={s.id}>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      'inline-block h-2.5 w-2.5 rounded-full transition-colors',
                      isDone
                        ? 'bg-emerald-500'
                        : isCurrent
                        ? 'bg-violet-500 ring-2 ring-violet-200'
                        : 'bg-gray-300',
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs">
                    <p className="font-medium">{ACCOMPAGNEMENT_STEP_LABELS[s.step]}</p>
                    {isDone && s.completed_at && (
                      <p className="opacity-80">Validé le {formatDateShort(s.completed_at)}</p>
                    )}
                    {!isDone && isCurrent && <p className="opacity-80">En cours</p>}
                    {!isDone && !isCurrent && <p className="opacity-80">À faire</p>}
                  </div>
                </TooltipContent>
              </Tooltip>
            )
          })}
      </div>
    )
  }

  // Detailed variant
  return (
    <div className="w-full">
      {/* Desktop: horizontal */}
      <div className="hidden md:flex items-start">
        {ordered.map((s, i) => {
          const isDone = !!s.completed_at
          const isCurrent = i === currentIdx
          const isLast = i === ordered.length - 1
          const Icon = isDone ? Check : Clock

          return (
            <div key={s.id} className="flex-1 flex flex-col items-center min-w-0">
              <div className="flex items-center w-full">
                {/* Connector line left (skip on first) */}
                <div
                  className={cn(
                    'h-0.5 flex-1',
                    i === 0 ? 'invisible' : isDone ? 'bg-emerald-500' : 'bg-gray-200',
                  )}
                />
                {/* Circle */}
                <button
                  type="button"
                  disabled={!onStepClick}
                  onClick={() => onStepClick?.(s)}
                  className={cn(
                    'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                    isDone
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : isCurrent
                      ? 'border-violet-500 bg-violet-50 text-violet-600 ring-4 ring-violet-100'
                      : 'border-gray-300 bg-white text-gray-400',
                    onStepClick && 'cursor-pointer hover:scale-105',
                  )}
                  aria-label={ACCOMPAGNEMENT_STEP_LABELS[s.step]}
                >
                  {isDone ? <Icon className="h-5 w-5" /> : isCurrent ? <Icon className="h-5 w-5" /> : <span className="text-sm font-semibold">{i + 1}</span>}
                </button>
                {/* Connector line right (skip on last) */}
                <div
                  className={cn(
                    'h-0.5 flex-1',
                    isLast ? 'invisible' : isDone && ordered[i + 1] && ordered[i + 1].completed_at ? 'bg-emerald-500' : 'bg-gray-200',
                  )}
                />
              </div>
              <div className="mt-2 text-center px-1 min-w-0 w-full">
                <p
                  className={cn(
                    'text-xs font-medium leading-tight truncate',
                    isCurrent ? 'text-violet-700' : isDone ? 'text-emerald-700' : 'text-muted-foreground',
                  )}
                  title={ACCOMPAGNEMENT_STEP_LABELS[s.step]}
                >
                  {ACCOMPAGNEMENT_STEP_LABELS[s.step]}
                </p>
                {isDone && s.completed_at && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatDateShort(s.completed_at)}
                  </p>
                )}
                {!isDone && isCurrent && (
                  <p className="text-[10px] text-violet-600 mt-0.5">En cours</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Mobile: vertical */}
      <div className="md:hidden flex flex-col gap-3">
        {ordered.map((s, i) => {
          const isDone = !!s.completed_at
          const isCurrent = i === currentIdx
          const Icon = isDone ? Check : Clock
          return (
            <button
              key={s.id}
              type="button"
              disabled={!onStepClick}
              onClick={() => onStepClick?.(s)}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors w-full',
                isDone
                  ? 'border-emerald-200 bg-emerald-50/40'
                  : isCurrent
                  ? 'border-violet-300 bg-violet-50/40'
                  : 'border-gray-200',
                onStepClick && 'hover:bg-accent cursor-pointer',
              )}
            >
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2',
                  isDone
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : isCurrent
                    ? 'border-violet-500 bg-violet-50 text-violet-600'
                    : 'border-gray-300 bg-white text-gray-400',
                )}
              >
                {isDone || isCurrent ? <Icon className="h-4 w-4" /> : <span className="text-xs font-semibold">{i + 1}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm font-medium',
                    isCurrent ? 'text-violet-700' : isDone ? 'text-emerald-700' : 'text-foreground',
                  )}
                >
                  {ACCOMPAGNEMENT_STEP_LABELS[s.step]}
                </p>
                {isDone && s.completed_at && (
                  <p className="text-xs text-muted-foreground">
                    Validé le {formatDateShort(s.completed_at)}
                  </p>
                )}
                {!isDone && isCurrent && <p className="text-xs text-violet-600">En cours</p>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
