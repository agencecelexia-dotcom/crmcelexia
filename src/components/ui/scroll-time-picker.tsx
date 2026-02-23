import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Button } from './button'
import { Clock } from 'lucide-react'

interface ScrollTimePickerProps {
  value: string // "HH:mm"
  onChange: (value: string) => void
  className?: string
  minuteStep?: number
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const ITEM_HEIGHT = 36

function padTwo(n: number): string {
  return n.toString().padStart(2, '0')
}

function ScrollColumn({
  items,
  selected,
  onSelect,
}: {
  items: number[]
  selected: number
  onSelect: (val: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isScrollingRef = useRef(false)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Scroll to selected item on mount and when selected changes externally
  useEffect(() => {
    if (isScrollingRef.current) return
    const container = containerRef.current
    if (!container) return
    const idx = items.indexOf(selected)
    if (idx < 0) return
    container.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' })
  }, [selected, items])

  const handleScroll = useCallback(() => {
    isScrollingRef.current = true
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout(() => {
      const container = containerRef.current
      if (!container) return
      const idx = Math.round(container.scrollTop / ITEM_HEIGHT)
      const clamped = Math.max(0, Math.min(idx, items.length - 1))
      // Snap to nearest item
      container.scrollTo({ top: clamped * ITEM_HEIGHT, behavior: 'smooth' })
      onSelect(items[clamped])
      // Allow external scroll updates again after snapping
      setTimeout(() => { isScrollingRef.current = false }, 150)
    }, 80)
  }, [items, onSelect])

  return (
    <div className="relative h-[180px] w-[60px] overflow-hidden">
      {/* Gradient overlays */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[72px] bg-gradient-to-b from-background to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[72px] bg-gradient-to-t from-background to-transparent" />
      {/* Selection highlight */}
      <div className="pointer-events-none absolute inset-x-1 top-1/2 z-10 -translate-y-1/2 h-[36px] rounded-md bg-primary/10 border border-primary/20" />
      {/* Scroll container */}
      <div
        ref={containerRef}
        className="h-full overflow-y-auto scrollbar-hide scroll-smooth"
        onScroll={handleScroll}
        style={{ scrollSnapType: 'y mandatory' }}
      >
        {/* Top/bottom padding so first/last items can center */}
        <div style={{ height: ITEM_HEIGHT * 2 }} />
        {items.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              onSelect(item)
              const container = containerRef.current
              if (container) {
                const idx = items.indexOf(item)
                isScrollingRef.current = true
                container.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' })
                setTimeout(() => { isScrollingRef.current = false }, 300)
              }
            }}
            className={cn(
              'flex items-center justify-center w-full text-sm font-medium transition-all',
              item === selected
                ? 'text-foreground text-base font-semibold'
                : 'text-muted-foreground/60 hover:text-muted-foreground',
            )}
            style={{ height: ITEM_HEIGHT, scrollSnapAlign: 'center' }}
          >
            {padTwo(item)}
          </button>
        ))}
        <div style={{ height: ITEM_HEIGHT * 2 }} />
      </div>
    </div>
  )
}

export function ScrollTimePicker({
  value,
  onChange,
  className,
  minuteStep = 5,
}: ScrollTimePickerProps) {
  const [open, setOpen] = useState(false)
  const [h, m] = (value || '09:00').split(':').map(Number)
  const minutes = Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) => i * minuteStep)

  // Snap minute to nearest step
  const snappedMinute = minutes.reduce((prev, curr) =>
    Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev,
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-start text-left font-mono tabular-nums gap-2',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <Clock className="h-4 w-4 text-muted-foreground" />
          {padTwo(h)}:{padTwo(snappedMinute)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="flex items-center gap-1">
          <ScrollColumn
            items={HOURS}
            selected={h}
            onSelect={(val) => onChange(`${padTwo(val)}:${padTwo(snappedMinute)}`)}
          />
          <span className="text-lg font-bold text-muted-foreground px-1">:</span>
          <ScrollColumn
            items={minutes}
            selected={snappedMinute}
            onSelect={(val) => onChange(`${padTwo(h)}:${padTwo(val)}`)}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
