import { useAuth } from '@/features/auth/hooks/use-auth'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { USER_ROLE_LABELS } from '@/types/enums'
import { Badge } from '@/components/ui/badge'

export function Header() {
  const { profile } = useAuth()

  const initials = profile?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '?'

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-6">
      <div />
      <div className="flex items-center gap-3">
        {profile && (
          <Badge variant="secondary" className="text-xs">
            {USER_ROLE_LABELS[profile.role]}
          </Badge>
        )}
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}
