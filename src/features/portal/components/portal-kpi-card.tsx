import type { ReactNode } from 'react'

// Carte KPI compacte utilisée dans les pages du portail artisan
// (dashboard, commission, …). Garde les couleurs et l'aspect visuel
// défini par les CSS vars du design system du portail.
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
    <div className="p-card p-card-hoverable" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: TONE_BG[tone],
            color: TONE_FG[tone],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </div>
        {delta && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: delta.startsWith('+') ? 'var(--emerald-600)' : 'var(--gray-500)',
            }}
          >
            {delta}
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--gray-500)',
          fontWeight: 500,
          marginBottom: 4,
          letterSpacing: '0.01em',
        }}
      >
        {label}
      </div>
      <div className="font-display" style={{ fontSize: 28, fontWeight: 700, color: 'var(--gray-900)' }}>
        {value}
      </div>
    </div>
  )
}
