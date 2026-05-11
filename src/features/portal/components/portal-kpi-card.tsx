import type { ReactNode } from 'react'

// Carte KPI compacte utilisée dans les pages du portail artisan
// (dashboard, commission, …). Compact sur mobile, généreux sur desktop.
export type PortalKpiTone = 'violet' | 'emerald' | 'blue' | 'amber'

const TONE_BG: Record<PortalKpiTone, string> = {
  violet: 'var(--violet-100)',
  emerald: 'var(--emerald-100)',
  blue: 'var(--blue-100)',
  amber: 'var(--amber-100)',
}

const TONE_FG: Record<PortalKpiTone, string> = {
  violet: 'var(--violet-600)',
  emerald: 'var(--emerald-600)',
  blue: 'var(--blue-600)',
  amber: 'var(--amber-600)',
}

interface PortalKpiCardProps {
  label: string
  value: string
  icon: ReactNode
  tone?: PortalKpiTone
  /** Variation vs période précédente (ex: "+12%"). Vert si commence par "+". */
  delta?: string
}

export function PortalKpiCard({ label, value, icon, tone = 'violet', delta }: PortalKpiCardProps) {
  return (
    <div className="p-card p-card-hoverable p-3 sm:p-5">
      <div className="mb-2 flex items-start justify-between sm:mb-3.5">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg sm:h-9 sm:w-9"
          style={{ background: TONE_BG[tone], color: TONE_FG[tone] }}
        >
          {icon}
        </div>
        {delta && (
          <span
            className="text-[11px] font-semibold sm:text-xs"
            style={{
              color: delta.startsWith('+') ? 'var(--emerald-600)' : 'var(--gray-500)',
            }}
          >
            {delta}
          </span>
        )}
      </div>
      <div className="mb-0.5 text-[11px] font-medium text-[var(--gray-500)] sm:text-xs">
        {label}
      </div>
      <div className="font-display text-xl font-bold text-[var(--gray-900)] sm:text-2xl md:text-[28px]">
        {value}
      </div>
    </div>
  )
}
