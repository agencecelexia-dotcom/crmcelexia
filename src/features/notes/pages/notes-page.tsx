import { useState, useEffect, useRef, useCallback } from 'react'
import { useTeamNotes, useUpsertTeamNote } from '../hooks/use-team-notes'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { StickyNote, Clock } from 'lucide-react'
import type { TeamNote } from '@/types'

// Couleurs distinctes par membre (cycle)
const MEMBER_COLORS = [
  { bg: 'bg-blue-50 border-blue-200', header: 'bg-blue-100', text: 'text-blue-800', badge: 'bg-blue-200 text-blue-800' },
  { bg: 'bg-violet-50 border-violet-200', header: 'bg-violet-100', text: 'text-violet-800', badge: 'bg-violet-200 text-violet-800' },
  { bg: 'bg-emerald-50 border-emerald-200', header: 'bg-emerald-100', text: 'text-emerald-800', badge: 'bg-emerald-200 text-emerald-800' },
  { bg: 'bg-amber-50 border-amber-200', header: 'bg-amber-100', text: 'text-amber-800', badge: 'bg-amber-200 text-amber-800' },
  { bg: 'bg-rose-50 border-rose-200', header: 'bg-rose-100', text: 'text-rose-800', badge: 'bg-rose-200 text-rose-800' },
]

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'à l\'instant'
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours}h`
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

interface MyNoteCardProps {
  myNote: TeamNote | undefined
  authorId: string
  colorIndex: number
}

function MyNoteCard({ myNote, authorId, colorIndex, }: MyNoteCardProps) {
  const upsert = useUpsertTeamNote()
  const [value, setValue] = useState(myNote?.content ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const color = MEMBER_COLORS[colorIndex % MEMBER_COLORS.length]

  // Sync incoming realtime changes (from another tab/device) but don't overwrite if user is typing
  const isTypingRef = useRef(false)
  useEffect(() => {
    if (!isTypingRef.current) {
      setValue(myNote?.content ?? '')
    }
  }, [myNote?.content])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value
      setValue(v)
      isTypingRef.current = true

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        isTypingRef.current = false
        await upsert.mutateAsync({ authorId, content: v })
      }, 800)
    },
    [authorId, upsert],
  )

  return (
    <Card className={`border-2 ${color.bg} flex flex-col h-full`}>
      <CardHeader className={`${color.header} rounded-t-lg py-3 px-4 flex-shrink-0`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${color.badge}`}>
              {initials('Moi')}
            </div>
            <CardTitle className={`text-sm font-semibold ${color.text}`}>
              Ma note
              <span className="ml-2 text-xs font-normal opacity-60">(modifiable)</span>
            </CardTitle>
          </div>
          {upsert.isPending && (
            <span className="text-[10px] text-muted-foreground animate-pulse">Sauvegarde...</span>
          )}
          {myNote && !upsert.isPending && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatRelative(myNote.updated_at)}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 flex flex-col">
        <Textarea
          value={value}
          onChange={handleChange}
          placeholder="Tape tes notes ici... elles sont sauvegardées automatiquement."
          className={`flex-1 resize-none rounded-t-none rounded-b-lg border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm min-h-[280px] p-4 ${color.text} placeholder:opacity-40`}
        />
      </CardContent>
    </Card>
  )
}

interface OtherNoteCardProps {
  note: TeamNote
  colorIndex: number
}

function OtherNoteCard({ note, colorIndex }: OtherNoteCardProps) {
  const color = MEMBER_COLORS[colorIndex % MEMBER_COLORS.length]
  const name = note.author?.full_name ?? 'Inconnu'

  return (
    <Card className={`border-2 ${color.bg} flex flex-col h-full`}>
      <CardHeader className={`${color.header} rounded-t-lg py-3 px-4 flex-shrink-0`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${color.badge}`}>
              {initials(name)}
            </div>
            <CardTitle className={`text-sm font-semibold ${color.text}`}>{name}</CardTitle>
          </div>
          {note.updated_at && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatRelative(note.updated_at)}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-4">
        {note.content ? (
          <p className={`text-sm whitespace-pre-wrap leading-relaxed ${color.text}`}>{note.content}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Aucune note pour l'instant.</p>
        )}
      </CardContent>
    </Card>
  )
}

export function NotesPage() {
  const { profile } = useAuth()
  const { data: notes, isLoading } = useTeamNotes()

  if (!profile) return null

  const myNote = notes?.find((n) => n.author_id === profile.id)
  const otherNotes = notes?.filter((n) => n.author_id !== profile.id) ?? []

  // Index de couleur stable par author_id
  const allAuthorIds: string[] = []
  if (myNote) allAuthorIds.push(myNote.author_id)
  otherNotes.forEach((n) => allAuthorIds.push(n.author_id))
  const allIds = [...new Set([profile.id, ...(notes?.map((n) => n.author_id) ?? [])])]
  const colorMap = Object.fromEntries(allIds.map((id, i) => [id, i]))

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b bg-background">
        <StickyNote className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Notes équipe</h1>
        <Badge variant="secondary" className="text-xs">
          Partagées en temps réel
        </Badge>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-80 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {/* Ma note toujours en premier */}
            <MyNoteCard
              myNote={myNote}
              authorId={profile.id}
              colorIndex={colorMap[profile.id] ?? 0}
            />

            {/* Notes des autres membres */}
            {otherNotes.map((note) => (
              <OtherNoteCard
                key={note.id}
                note={note}
                colorIndex={colorMap[note.author_id] ?? 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
