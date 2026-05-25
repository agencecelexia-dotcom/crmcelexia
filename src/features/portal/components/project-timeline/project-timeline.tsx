import { CheckCircle2, Circle, Loader2, FileText, ExternalLink, AlertCircle } from 'lucide-react'
import type { PortalLead, PortalLeadInvoice, Quote } from '@/types'
import { buildTimelineSteps, type TimelineStep, type TimelineActionKey } from './use-timeline-steps'
import { formatEur } from '../../lib/format'

/**
 * Timeline projet unifiée. Affiche les 8 étapes de bout en bout pour un lead.
 *
 * - Mobile : 1 colonne stack vertical
 * - Desktop : timeline gauche + métadonnées droite (grid)
 *
 * Le composant est pur (data-in / event-out). Pas d'appel Supabase ici,
 * c'est le parent qui charge lead + quotes + invoices et passe les props.
 */

export interface ProjectTimelineProps {
  lead: PortalLead
  quotes: Quote[]
  invoices: PortalLeadInvoice[]
  /** Callback appelé quand l'utilisateur clique sur une action d'étape.
   *  Le parent décide quoi faire (ouvrir un dialog, appeler une mutation, etc.) */
  onAction?: (key: TimelineActionKey) => void
}

function formatDateFR(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function StepDot({ status }: { status: TimelineStep['status'] }) {
  if (status === 'done') {
    return (
      <div className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
        <CheckCircle2 size={14} aria-hidden="true" />
      </div>
    )
  }
  if (status === 'current') {
    return (
      <div className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-violet-500 text-white shadow-sm">
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
      </div>
    )
  }
  if (status === 'blocked') {
    return (
      <div className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm">
        <AlertCircle size={14} aria-hidden="true" />
      </div>
    )
  }
  // upcoming
  return (
    <div className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-slate-300">
      <Circle size={10} aria-hidden="true" />
    </div>
  )
}

function StepMeta({ step }: { step: TimelineStep }) {
  const m = step.meta
  switch (step.key) {
    case 'lead_arrived':
      return <span className="text-xs text-slate-500">Reçu via <strong>{m.source}</strong></span>
    case 'quote_sent':
      if (!m.quote_number) return null
      return (
        <span className="text-xs text-slate-600">
          {m.is_external ? 'PDF importé' : `Devis ${m.quote_number}`}
          {m.amount_ttc ? ` · ${formatEur(Number(m.amount_ttc))} TTC` : ''}
        </span>
      )
    case 'quote_signed':
      if (!m.amount) return null
      return (
        <span className="text-xs text-emerald-700 font-medium">
          Montant signé : {formatEur(Number(m.amount))}
          {m.has_pdf ? ' · PDF disponible' : ''}
        </span>
      )
    case 'commission_invoiced':
      if (!m.amount) return null
      return (
        <span className="text-xs text-slate-600">
          Commission {Number(m.rate) * 100}% · {formatEur(Number(m.amount))}
        </span>
      )
    case 'commission_paid':
      if (m.commission_status === 'declared_paid') {
        return <span className="text-xs text-amber-700">Déclaré payé · en attente de validation Celexia</span>
      }
      return null
    case 'project_completed':
      if (typeof m.invoices_count === 'number' && m.invoices_count > 0) {
        return <span className="text-xs text-slate-600">{m.invoices_count} facture{m.invoices_count > 1 ? 's' : ''} chantier</span>
      }
      return null
    default:
      return null
  }
}

export function ProjectTimeline({ lead, quotes, invoices, onAction }: ProjectTimelineProps) {
  const steps = buildTimelineSteps(lead, quotes, invoices)
  const doneCount = steps.filter(s => s.status === 'done').length
  const totalCount = steps.length

  return (
    <div className="p-card" style={{ padding: 20 }}>
      <div className="mb-5 flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold text-[var(--gray-900)] sm:text-lg">
          Avancement du projet
        </h2>
        <span className="text-xs font-semibold text-slate-500 tabular-nums">
          {doneCount} / {totalCount}
        </span>
      </div>

      <ol className="relative" aria-label="Étapes du projet">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1
          return (
            <li key={step.key} className="relative grid grid-cols-[28px_1fr] gap-3 pb-5">
              {/* Vertical line connecting dots (sauf dernière étape) */}
              {!isLast && (
                <span
                  className={`absolute left-[13px] top-7 h-[calc(100%-12px)] w-px ${
                    step.status === 'done'
                      ? 'bg-emerald-200'
                      : 'bg-slate-200'
                  }`}
                  aria-hidden="true"
                />
              )}

              <StepDot status={step.status} />

              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <h3 className={`text-sm font-semibold ${
                    step.status === 'done' ? 'text-slate-900' :
                    step.status === 'current' ? 'text-violet-700' :
                    'text-slate-400'
                  }`}>
                    {step.label}
                  </h3>
                  <span className={`text-xs font-medium tabular-nums ${
                    step.status === 'done' ? 'text-slate-500' :
                    step.status === 'current' ? 'text-violet-600' :
                    'text-slate-300'
                  }`}>
                    {step.date ? formatDateFR(step.date) : step.status === 'current' ? 'En cours' : 'À venir'}
                  </span>
                </div>

                <div className="mt-0.5">
                  <StepMeta step={step} />
                </div>

                {/* Action button — visible uniquement pour étapes 'current' */}
                {step.status === 'current' && step.actionKey && step.actionLabel && onAction && (
                  <button
                    type="button"
                    onClick={() => onAction(step.actionKey!)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1"
                  >
                    {step.actionLabel}
                  </button>
                )}

                {/* PDF link if available on done quote_signed step */}
                {step.key === 'quote_signed' && step.status === 'done' && step.meta.has_pdf ? (
                  <div className="mt-1.5 flex items-center gap-1 text-xs text-violet-700">
                    <FileText size={12} aria-hidden="true" />
                    <span>PDF signé disponible</span>
                  </div>
                ) : null}

                {/* Responsabilité indicateur (uniquement pour current/upcoming) */}
                {step.status !== 'done' && step.status !== 'upcoming' && (
                  <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">
                    {step.responsible === 'celexia' ? 'Action Celexia' : 'Votre action'}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {lead.status === 'perdu' && (
        <div className="mt-3 rounded-md bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
          <ExternalLink size={14} aria-hidden="true" />
          Ce lead a été marqué comme perdu. Les étapes restantes ne s'appliquent plus.
        </div>
      )}
    </div>
  )
}
