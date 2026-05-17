import { NavLink } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSmartleadInbox } from '@/features/prospection/hooks/use-smartlead-inbox'

interface Props {
  onNavigate?: () => void
}

/** Lien sidebar "Inbox Smartlead" avec compteur live des replies à traiter. */
export function SmartleadInboxNavLink({ onNavigate }: Props) {
  const { data } = useSmartleadInbox()
  const count = data?.length ?? 0

  return (
    <NavLink
      to="/prospects/inbox"
      className={({ isActive }) =>
        cn(
          'flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
        )
      }
      onClick={onNavigate}
    >
      <span className="flex items-center gap-3">
        <Inbox className="h-4 w-4" />
        Inbox Smartlead
      </span>
      {count > 0 && (
        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-purple-500 text-white text-[10px] font-bold leading-none animate-pulse">
          {count}
        </span>
      )}
    </NavLink>
  )
}
