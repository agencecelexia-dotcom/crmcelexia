import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/hooks/use-auth'
import {
  LayoutDashboard,
  Users,
  Phone,
  Calendar,
  Building2,
  FileText,
  Settings,
  LogOut,
  Target,
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
  { to: '/settings/company', label: 'Entreprise', icon: <Building2 className="h-4 w-4" />, founderOnly: true },
  { to: '/settings/targets', label: 'Objectifs', icon: <Target className="h-4 w-4" />, founderOnly: true },
  { to: '/settings', label: 'Paramètres', icon: <Settings className="h-4 w-4" /> },
]

export function Sidebar() {
  const { profile, isFounder, signOut } = useAuth()

  const visibleItems = navItems.filter(
    (item) => !item.founderOnly || isFounder
  )

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-6">
        <img src="/logo.png" alt="Celexia" className="h-8 w-8 rounded-lg" />
        <span className="text-lg font-bold tracking-tight text-white">Celexia</span>
      </div>
      <Separator className="bg-sidebar-border" />
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/settings'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
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
      <Separator className="bg-sidebar-border" />
      <div className="p-4">
        <div className="mb-3 text-sm">
          <p className="font-medium truncate text-sidebar-foreground">{profile?.full_name}</p>
          <p className="text-xs text-sidebar-foreground/50 truncate">{profile?.email}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" />
          Déconnexion
        </Button>
      </div>
    </div>
  )
}
