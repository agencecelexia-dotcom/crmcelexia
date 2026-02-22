import { useState, useMemo } from 'react'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useCalendarEvents, useDeleteCalendarEvent } from '../hooks/use-calendar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Phone,
  Video,
  Plus,
  CalendarPlus,
  Trash2,
} from 'lucide-react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths, isSameDay, isToday, parseISO, eachDayOfInterval } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { CalendarEvent } from '../services/calendar-service'
import { AddEventDialog } from '../components/add-event-dialog'
import { toast } from 'sonner'

type ViewMode = 'day' | 'week' | 'month'

export function CalendarPage() {
  const { profile, isFounder } = useAuth()
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showAddEvent, setShowAddEvent] = useState(false)
  const deleteEvent = useDeleteCalendarEvent()

  // Drag-to-create state
  const [dragEventDate, setDragEventDate] = useState<Date | undefined>()
  const [dragEventStartTime, setDragEventStartTime] = useState<string | undefined>()
  const [dragEventEndTime, setDragEventEndTime] = useState<string | undefined>()

  const handleDragCreate = (day: Date, startHour: number, endHour: number) => {
    setDragEventDate(day)
    setDragEventStartTime(`${String(startHour).padStart(2, '0')}:00`)
    setDragEventEndTime(`${String(endHour).padStart(2, '0')}:00`)
    setShowAddEvent(true)
  }

  const { startDate, endDate } = useMemo(() => {
    switch (viewMode) {
      case 'day':
        return {
          startDate: new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()).toISOString(),
          endDate: new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 23, 59, 59).toISOString(),
        }
      case 'week': {
        const s = startOfWeek(currentDate, { weekStartsOn: 1 })
        const e = endOfWeek(currentDate, { weekStartsOn: 1 })
        return { startDate: s.toISOString(), endDate: e.toISOString() }
      }
      case 'month': {
        const s = startOfMonth(currentDate)
        const e = endOfMonth(currentDate)
        return { startDate: s.toISOString(), endDate: e.toISOString() }
      }
    }
  }, [viewMode, currentDate])

  const commercialId = isFounder ? undefined : profile?.id
  const { data: events, isLoading } = useCalendarEvents(startDate, endDate, commercialId)

  const navigate_ = (direction: 'prev' | 'next') => {
    const fn = direction === 'prev'
      ? viewMode === 'day' ? subDays : viewMode === 'week' ? subWeeks : subMonths
      : viewMode === 'day' ? addDays : viewMode === 'week' ? addWeeks : addMonths
    setCurrentDate(fn(currentDate, 1))
  }

  const title = useMemo(() => {
    switch (viewMode) {
      case 'day':
        return format(currentDate, 'EEEE d MMMM yyyy', { locale: fr })
      case 'week': {
        const s = startOfWeek(currentDate, { weekStartsOn: 1 })
        const e = endOfWeek(currentDate, { weekStartsOn: 1 })
        return `${format(s, 'd MMM', { locale: fr })} - ${format(e, 'd MMM yyyy', { locale: fr })}`
      }
      case 'month':
        return format(currentDate, 'MMMM yyyy', { locale: fr })
    }
  }, [viewMode, currentDate])

  const days = useMemo(() => {
    switch (viewMode) {
      case 'day':
        return [currentDate]
      case 'week': {
        const s = startOfWeek(currentDate, { weekStartsOn: 1 })
        return eachDayOfInterval({ start: s, end: addDays(s, 6) })
      }
      case 'month': {
        const s = startOfMonth(currentDate)
        const e = endOfMonth(currentDate)
        const weekStart = startOfWeek(s, { weekStartsOn: 1 })
        const weekEnd = endOfWeek(e, { weekStartsOn: 1 })
        return eachDayOfInterval({ start: weekStart, end: weekEnd })
      }
    }
  }, [viewMode, currentDate])

  const getEventsForDay = (day: Date) => {
    return (events ?? []).filter(e => isSameDay(parseISO(e.start), day))
  }

  const handleEventClick = (e: CalendarEvent) => {
    if (e.prospectId) {
      navigate(`/prospects/${e.prospectId}`)
    }
  }

  const handleDeleteManualEvent = async (rawId: string) => {
    try {
      await deleteEvent.mutateAsync(rawId)
      toast.success('Événement supprimé')
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  const eventTypeIcon = (type: string) => {
    switch (type) {
      case 'rdv': return <Video className="h-3 w-3" />
      case 'reminder': return <Clock className="h-3 w-3" />
      case 'manual': return <CalendarPlus className="h-3 w-3" />
      default: return <Phone className="h-3 w-3" />
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendrier</h1>
          <p className="text-muted-foreground">
            {isFounder ? 'Vue globale de l\'équipe' : 'Mes rendez-vous et rappels'}
          </p>
        </div>
        <Button onClick={() => { setDragEventDate(undefined); setDragEventStartTime(undefined); setDragEventEndTime(undefined); setShowAddEvent(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Ajouter
        </Button>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => navigate_('prev')}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                Aujourd'hui
              </Button>
              <Button variant="outline" size="icon" onClick={() => navigate_('next')}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <h2 className="text-lg font-semibold capitalize ml-2">{title}</h2>
            </div>
            <div className="flex gap-1">
              {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
                <Button
                  key={mode}
                  variant={viewMode === mode ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode(mode)}
                >
                  {mode === 'day' ? 'Jour' : mode === 'week' ? 'Semaine' : 'Mois'}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span>RDV prévu</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>RDV fait</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span>Rappel</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span>No-show</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-violet-500" />
          <span>Événement</span>
        </div>
      </div>

      {/* Calendar Grid */}
      {isLoading ? (
        <Skeleton className="h-96" />
      ) : viewMode === 'month' ? (
        <MonthView days={days} getEventsForDay={getEventsForDay} eventTypeIcon={eventTypeIcon} navigate={navigate} onDeleteManual={handleDeleteManualEvent} />
      ) : viewMode === 'week' ? (
        <WeekView days={days} getEventsForDay={getEventsForDay} onEventClick={handleEventClick} onDeleteManual={handleDeleteManualEvent} onDragCreate={handleDragCreate} />
      ) : (
        <DayView day={currentDate} events={getEventsForDay(currentDate)} onEventClick={handleEventClick} eventTypeIcon={eventTypeIcon} onDeleteManual={handleDeleteManualEvent} onDragCreate={handleDragCreate} />
      )}

      <AddEventDialog
        open={showAddEvent}
        onOpenChange={setShowAddEvent}
        defaultDate={dragEventDate ?? currentDate}
        defaultStartTime={dragEventStartTime}
        defaultEndTime={dragEventEndTime}
      />
    </div>
  )
}

function MonthView({
  days,
  getEventsForDay,
  eventTypeIcon,
  navigate,
  onDeleteManual,
}: {
  days: Date[]
  getEventsForDay: (day: Date) => CalendarEvent[]
  eventTypeIcon: (type: string) => React.ReactNode
  navigate: (path: string) => void
  onDeleteManual: (id: string) => void
}) {
  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
  const currentMonth = days[Math.floor(days.length / 2)].getMonth()

  return (
    <Card>
      <CardContent className="p-0">
        <div className="grid grid-cols-7">
          {weekDays.map((d) => (
            <div key={d} className="border-b border-r p-2 text-center text-xs font-medium text-muted-foreground bg-muted/30">
              {d}
            </div>
          ))}
          {days.map((day, i) => {
            const dayEvents = getEventsForDay(day)
            const isCurrentMonth = day.getMonth() === currentMonth
            return (
              <div
                key={i}
                className={`border-b border-r min-h-[100px] p-1.5 ${
                  !isCurrentMonth ? 'bg-muted/10 opacity-50' : ''
                } ${isToday(day) ? 'bg-primary/5' : ''}`}
              >
                <div className={`text-xs font-medium mb-1 ${isToday(day) ? 'text-primary font-bold' : ''}`}>
                  {format(day, 'd')}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((e) => (
                    <div
                      key={e.id}
                      className="text-[10px] rounded px-1 py-0.5 cursor-pointer truncate flex items-center gap-1 group/evt"
                      style={{ backgroundColor: e.color + '20', color: e.color }}
                      onClick={() => e.prospectId && navigate(`/prospects/${e.prospectId}`)}
                    >
                      {eventTypeIcon(e.type)}
                      <span className="truncate flex-1">{e.prospectName ?? e.title}</span>
                      {e.type === 'manual' && e.meta?.rawId ? (
                        <button
                          className="opacity-0 group-hover/evt:opacity-100 shrink-0"
                          onClick={(ev) => { ev.stopPropagation(); onDeleteManual(e.meta!.rawId as string) }}
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} autres</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function WeekView({
  days,
  getEventsForDay,
  onEventClick,
  onDeleteManual,
  onDragCreate,
}: {
  days: Date[]
  getEventsForDay: (day: Date) => CalendarEvent[]
  onEventClick: (e: CalendarEvent) => void
  onDeleteManual: (id: string) => void
  onDragCreate?: (day: Date, startHour: number, endHour: number) => void
}) {
  const hours = Array.from({ length: 12 }, (_, i) => i + 8) // 8h-19h
  const [drag, setDrag] = useState<{ dayIdx: number; startHour: number; currentHour: number } | null>(null)

  const isCellInDrag = (dayIdx: number, hour: number) => {
    if (!drag || dayIdx !== drag.dayIdx) return false
    const min = Math.min(drag.startHour, drag.currentHour)
    const max = Math.max(drag.startHour, drag.currentHour)
    return hour >= min && hour <= max
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <div
          className="grid grid-cols-[60px_repeat(7,1fr)] min-w-[800px]"
          onMouseUp={() => {
            if (drag && onDragCreate) {
              const min = Math.min(drag.startHour, drag.currentHour)
              const max = Math.max(drag.startHour, drag.currentHour) + 1
              onDragCreate(days[drag.dayIdx], min, max)
            }
            setDrag(null)
          }}
          onMouseLeave={() => setDrag(null)}
        >
          {/* Header */}
          <div className="border-b border-r p-2" />
          {days.map((day, i) => (
            <div
              key={i}
              className={`border-b border-r p-2 text-center ${isToday(day) ? 'bg-primary/5' : ''}`}
            >
              <div className="text-xs text-muted-foreground">{format(day, 'EEE', { locale: fr })}</div>
              <div className={`text-lg font-semibold ${isToday(day) ? 'text-primary' : ''}`}>{format(day, 'd')}</div>
            </div>
          ))}

          {/* Time slots */}
          {hours.map((hour) => (
            <>
              <div key={`h-${hour}`} className="border-b border-r p-1 text-[11px] text-muted-foreground text-right pr-2">
                {hour}:00
              </div>
              {days.map((day, i) => {
                const dayEvents = getEventsForDay(day)
                const hourEvents = dayEvents.filter(e => {
                  const eventHour = parseISO(e.start).getHours()
                  return eventHour === hour
                })
                const inDrag = isCellInDrag(i, hour)
                return (
                  <div
                    key={`${hour}-${i}`}
                    className={`border-b border-r min-h-[48px] p-0.5 select-none ${
                      onDragCreate ? 'cursor-crosshair' : ''
                    } ${inDrag ? 'bg-primary/20' : isToday(day) ? 'bg-primary/5' : ''}`}
                    onMouseDown={(e) => {
                      if (!onDragCreate) return
                      e.preventDefault()
                      setDrag({ dayIdx: i, startHour: hour, currentHour: hour })
                    }}
                    onMouseEnter={() => {
                      if (drag && i === drag.dayIdx) {
                        setDrag(prev => prev ? { ...prev, currentHour: hour } : null)
                      }
                    }}
                  >
                    {hourEvents.map((e) => (
                      <div
                        key={e.id}
                        className="text-[11px] rounded px-1.5 py-1 cursor-pointer mb-0.5 flex items-center gap-1 group/evt"
                        style={{ backgroundColor: e.color + '25', borderLeft: `3px solid ${e.color}` }}
                        onClick={() => onEventClick(e)}
                        onMouseDown={(ev) => ev.stopPropagation()}
                      >
                        <span className="font-medium">{format(parseISO(e.start), 'HH:mm')}</span>
                        <span className="truncate flex-1">{e.prospectName ?? e.title}</span>
                        {e.type === 'manual' && e.meta?.rawId ? (
                          <button
                            className="opacity-0 group-hover/evt:opacity-100 shrink-0"
                            onClick={(ev) => { ev.stopPropagation(); onDeleteManual(e.meta!.rawId as string) }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )
              })}
            </>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function DayView({
  day,
  events,
  onEventClick,
  eventTypeIcon,
  onDeleteManual,
  onDragCreate,
}: {
  day: Date
  events: CalendarEvent[]
  onEventClick: (e: CalendarEvent) => void
  eventTypeIcon: (type: string) => React.ReactNode
  onDeleteManual: (id: string) => void
  onDragCreate?: (day: Date, startHour: number, endHour: number) => void
}) {
  const hours = Array.from({ length: 14 }, (_, i) => i + 7) // 7h-20h
  const [drag, setDrag] = useState<{ startHour: number; currentHour: number } | null>(null)

  const isHourInDrag = (hour: number) => {
    if (!drag) return false
    const min = Math.min(drag.startHour, drag.currentHour)
    const max = Math.max(drag.startHour, drag.currentHour)
    return hour >= min && hour <= max
  }

  return (
    <Card>
      <CardContent
        className="p-0"
        onMouseUp={() => {
          if (drag && onDragCreate) {
            const min = Math.min(drag.startHour, drag.currentHour)
            const max = Math.max(drag.startHour, drag.currentHour) + 1
            onDragCreate(day, min, max)
          }
          setDrag(null)
        }}
        onMouseLeave={() => setDrag(null)}
      >
        {hours.map((hour) => {
          const hourEvents = events.filter(e => parseISO(e.start).getHours() === hour)
          const inDrag = isHourInDrag(hour)
          return (
            <div
              key={hour}
              className={`flex border-b min-h-[56px] select-none ${
                onDragCreate ? 'cursor-crosshair' : ''
              } ${inDrag ? 'bg-primary/20' : ''}`}
              onMouseDown={(e) => {
                if (!onDragCreate) return
                e.preventDefault()
                setDrag({ startHour: hour, currentHour: hour })
              }}
              onMouseEnter={() => {
                if (drag) setDrag(prev => prev ? { ...prev, currentHour: hour } : null)
              }}
            >
              <div className="w-16 p-2 text-sm text-muted-foreground text-right border-r shrink-0">
                {hour}:00
              </div>
              <div className="flex-1 p-1 space-y-1">
                {hourEvents.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-lg px-3 py-2 cursor-pointer flex items-center gap-3 group/evt"
                    style={{ backgroundColor: e.color + '15', borderLeft: `4px solid ${e.color}` }}
                    onClick={() => onEventClick(e)}
                    onMouseDown={(ev) => ev.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      {eventTypeIcon(e.type)}
                      <span className="text-sm font-medium">{format(parseISO(e.start), 'HH:mm')}</span>
                      {e.end && <span className="text-xs text-muted-foreground">- {format(parseISO(e.end), 'HH:mm')}</span>}
                    </div>
                    <span className="text-sm font-medium flex-1">{e.title}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {e.type === 'rdv' ? 'RDV' : e.type === 'manual' ? 'Événement' : 'Rappel'}
                    </Badge>
                    {e.type === 'manual' && e.meta?.rawId ? (
                      <button
                        className="opacity-0 group-hover/evt:opacity-100"
                        onClick={(ev) => { ev.stopPropagation(); onDeleteManual(e.meta!.rawId as string) }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
