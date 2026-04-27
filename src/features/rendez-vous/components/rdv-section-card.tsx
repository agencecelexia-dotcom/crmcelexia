import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type RdvSectionAccent = 'default' | 'warning' | 'destructive'

interface RdvSectionCardProps {
  title: string
  count: number
  accent?: RdvSectionAccent
  children: ReactNode
}

const ACCENT_CARD_CLASS: Record<RdvSectionAccent, string> = {
  default: '',
  warning: 'border-orange-200',
  destructive: 'border-red-200',
}

const ACCENT_BADGE_CLASS: Record<RdvSectionAccent, string> = {
  default: 'bg-primary/10 text-primary',
  warning: 'bg-orange-100 text-orange-800',
  destructive: 'bg-red-100 text-red-800',
}

export function RdvSectionCard({ title, count, accent = 'default', children }: RdvSectionCardProps) {
  return (
    <Card className={cn('overflow-hidden', ACCENT_CARD_CLASS[accent])}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 py-3 border-b bg-muted/30">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <Badge variant="secondary" className={cn('font-medium', ACCENT_BADGE_CLASS[accent])}>
          {count}
        </Badge>
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  )
}
