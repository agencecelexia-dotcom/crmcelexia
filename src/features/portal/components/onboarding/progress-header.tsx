import { Progress } from '@/components/ui/progress'

interface Props {
  step: number
  total?: number
  title: string
  subtitle?: string
}

export function ProgressHeader({ step, total = 5, title, subtitle }: Props) {
  const pct = Math.round((step / total) * 100)

  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-violet-600">
          Étape {step} sur {total}
        </span>
        <span className="text-sm font-medium text-gray-500">{pct}%</span>
      </div>
      <Progress value={pct} className="h-2 mb-6" />
      <h1 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
        {title}
      </h1>
      {subtitle && <p className="text-base text-gray-500">{subtitle}</p>}
    </div>
  )
}
