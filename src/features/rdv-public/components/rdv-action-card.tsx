import { Loader2 } from 'lucide-react'

type Variant = 'success' | 'already' | 'expired' | 'invalid' | 'cancelled' | 'loading' | 'confirm-cancel'

interface Props {
  variant: Variant
  title: string
  subtitle?: string
  hint?: string
  children?: React.ReactNode
}

const ICONS: Record<Variant, { glyph: string; bg: string }> = {
  success: { glyph: '✓', bg: '#10B981' },
  already: { glyph: '✓', bg: '#10B981' },
  cancelled: { glyph: '✓', bg: '#0EA5E9' },
  expired: { glyph: '!', bg: '#F59E0B' },
  invalid: { glyph: '×', bg: '#EF4444' },
  loading: { glyph: '', bg: '#94A3B8' },
  'confirm-cancel': { glyph: '?', bg: '#F59E0B' },
}

export function RdvActionCard({ variant, title, subtitle, hint, children }: Props) {
  const icon = ICONS[variant]
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#FAFAFA]">
      <div className="w-full max-w-[460px] bg-white rounded-2xl px-10 py-14 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)]">
        <div
          className="w-16 h-16 rounded-full inline-flex items-center justify-center text-white text-3xl font-bold mb-6"
          style={{ background: icon.bg }}
        >
          {variant === 'loading' ? <Loader2 className="h-8 w-8 animate-spin" /> : icon.glyph}
        </div>
        <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight mb-3">{title}</h1>
        {subtitle && <p className="text-[15px] text-[#475569] mb-6">{subtitle}</p>}
        {children}
        {hint && (
          <p className="text-[13px] text-[#94A3B8] mt-8 pt-6 border-t border-[#F1F5F9]">{hint}</p>
        )}
        <div className="mt-8 text-[11px] font-bold tracking-[0.08em] uppercase text-[#94A3B8]">
          Celexia
        </div>
      </div>
    </div>
  )
}
