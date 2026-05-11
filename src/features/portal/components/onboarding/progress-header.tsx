interface Props {
  step: number
  total?: number
  title?: string
}

export function ProgressHeader({ step, total = 4, title }: Props) {
  const pct = (step / total) * 100

  return (
    <div className="mb-6 md:mb-8">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 sm:text-xs">
          Étape {step} sur {total}
        </span>
        <span className="text-xs font-medium text-gray-500 sm:text-sm">{Math.round(pct)}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {title && (
        <h1 className="font-display mt-5 mb-2 text-2xl font-bold text-gray-900 sm:text-3xl md:mt-6 md:text-[32px] md:leading-tight">
          {title}
        </h1>
      )}
    </div>
  )
}
