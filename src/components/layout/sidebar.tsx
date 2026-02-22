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
  CalendarDays,
  TrendingUp,
  FileCheck,
  CreditCard,
  BarChart3,
  RefreshCcw,
  Zap,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useUndo } from '@/hooks/use-undo'
import { toast } from 'sonner'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  founderOnly?: boolean
}

interface NavSection {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: '',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    ],
  },
  {
    title: 'Commercial',
    items: [
      { to: '/prospects', label: 'Prospects', icon: <Phone className="h-4 w-4" /> },
      { to: '/rdv', label: 'Rendez-vous', icon: <Calendar className="h-4 w-4" /> },
      { to: '/calendar', label: 'Calendrier', icon: <CalendarDays className="h-4 w-4" /> },
      { to: '/opportunities', label: 'Opportunités', icon: <Zap className="h-4 w-4" /> },
    ],
  },
  {
    title: 'Gestion',
    items: [
      { to: '/clients', label: 'Clients', icon: <Building2 className="h-4 w-4" />, founderOnly: true },
      { to: '/contracts', label: 'Contrats', icon: <FileCheck className="h-4 w-4" />, founderOnly: true },
      { to: '/billing', label: 'Devis & Facturation', icon: <FileText className="h-4 w-4" />, founderOnly: true },
      { to: '/payments', label: 'Paiements', icon: <CreditCard className="h-4 w-4" />, founderOnly: true },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { to: '/performance', label: 'Performance', icon: <BarChart3 className="h-4 w-4" /> },
      { to: '/objectives', label: 'Objectifs', icon: <Target className="h-4 w-4" /> },
      { to: '/followup', label: 'Suivi long terme', icon: <RefreshCcw className="h-4 w-4" />, founderOnly: true },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { to: '/settings/team', label: 'Équipe', icon: <Users className="h-4 w-4" />, founderOnly: true },
      { to: '/settings/company', label: 'Entreprise', icon: <Building2 className="h-4 w-4" />, founderOnly: true },
      { to: '/settings/targets', label: 'Cibles appels', icon: <TrendingUp className="h-4 w-4" />, founderOnly: true },
      { to: '/settings', label: 'Paramètres', icon: <Settings className="h-4 w-4" /> },
    ],
  },
]

interface SidebarProps {
  onNavigate?: () => void
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const { profile, isFounder, signOut } = useAuth()
  const { undoAction, clearUndo } = useUndo()

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-6">
        <img src="/logocelexia.png" alt="Celexia" className="h-8 w-8 rounded-lg" />
        <span className="text-lg font-bold tracking-tight text-white">Celexia</span>
      </div>
      <Separator className="bg-sidebar-border" />
      <ScrollArea className="flex-1 min-h-0 px-3 py-4">
        <nav className="space-y-4">
          {navSections.map((section) => {
            const visibleItems = section.items.filter(
              (item) => !item.founderOnly || isFounder
            )
            if (visibleItems.length === 0) return null
            return (
              <div key={section.title || 'main'}>
                {section.title && (
                  <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                    {section.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/settings'}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                        )
                      }
                      onClick={onNavigate}
                    >
                      {item.icon}
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>
      </ScrollArea>
      <Separator className="bg-sidebar-border" />
      <div className="p-4">
        <div className="mb-3 text-sm">
          <p className="font-medium truncate text-sidebar-foreground">{profile?.full_name}</p>
          <p className="text-xs text-sidebar-foreground/50 truncate">{profile?.email}</p>
        </div>
        {undoAction && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 mb-1 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
            onClick={async () => {
              const confirmed = window.confirm('Êtes-vous sûr de vouloir annuler cette action ?')
              if (!confirmed) return
              try {
                await undoAction.undo()
                toast.success('Action annulée')
                clearUndo()
              } catch {
                toast.error("Erreur lors de l'annulation")
              }
            }}
          >
            <Undo2 className="h-4 w-4" />
            Annuler
          </Button>
        )}
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
