import { useAuth } from '@/features/auth/hooks/use-auth'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { USER_ROLE_LABELS } from '@/types/enums'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Moon, Sun, Menu } from 'lucide-react'
import { useTheme } from '@/hooks/use-theme'

interface HeaderProps {
  onToggleSidebar?: () => void
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const { profile } = useAuth()
  const { theme, toggleTheme } = useTheme()

  const initials = profile?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '?'

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="h-8 w-8 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-8 w-8"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        {profile && (
          <Badge variant="secondary" className="text-xs hidden sm:inline-flex">
            {USER_ROLE_LABELS[profile.role]}
          </Badge>
        )}
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}
