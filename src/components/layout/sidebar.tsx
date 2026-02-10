import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { APP_NAME } from '@/lib/constants'
import {
  LayoutDashboard,
  Users,
  Phone,
  Calendar,
  Building2,
  FileText,
  Settings,
  LogOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  founderOnly?: boolean
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: '/prospects', label: 'Prospects', icon: <Phone className="h-4 w-4" /> },
  { to: '/rdv', label: 'Rendez-vous', icon: <Calendar className="h-4 w-4" /> },
  { to: '/clients', label: 'Clients', icon: <Building2 className="h-4 w-4" />, founderOnly: true },
  { to: '/billing', label: 'Devis & Facturation', icon: <FileText className="h-4 w-4" />, founderOnly: true },
  { to: '/settings/team', label: 'Équipe', icon: <Users className="h-4 w-4" />, founderOnly: true },
  { to: '/settings', label: 'Paramètres', icon: <Settings className="h-4 w-4" /> },
]

export function Sidebar() {
  const { profile, isFounder, signOut } = useAuth()

  const visibleItems = navItems.filter(
    (item) => !item.founderOnly || isFounder
  )

  return (
    <div className="flex h-full w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center px-6 font-bold text-lg">
        {APP_NAME}
      </div>
      <Separator />
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/settings'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
      </ScrollArea>
      <Separator />
      <div className="p-4">
        <div className="mb-3 text-sm">
          <p className="font-medium truncate">{profile?.full_name}</p>
          <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" />
          Déconnexion
        </Button>
      </div>
    </div>
  )
}
