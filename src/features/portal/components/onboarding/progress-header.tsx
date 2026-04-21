interface Props {
  step: number
  total?: number
  title?: string
}

export function ProgressHeader({ step, total = 5, title }: Props) {
  const pct = (step / total) * 100

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--violet-600)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Étape {step} sur {total}
        </span>
        <span style={{ fontSize: 13, color: 'var(--gray-500)', fontWeight: 500 }}>{Math.round(pct)}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {title && (
        <h1 className="font-display" style={{ fontSize: 32, fontWeight: 700, color: 'var(--gray-900)', marginTop: 24, marginBottom: 8 }}>
          {title}
        </h1>
      )}
    </div>
  )
}
