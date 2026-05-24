import { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { usePortalShortcuts } from '../hooks/use-portal-shortcuts'
import { Home, LayoutGrid, Euro, FolderOpen, KeyRound, LogOut, Menu, FileText, Settings, Star } from 'lucide-react'
import { ChangePasswordDialog } from './change-password-dialog'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import '../portal.css'

const NAV_ITEMS = [
  { to: '/portal/dashboard', label: 'Dashboard', icon: Home },
  { to: '/portal/leads', label: 'Leads', icon: LayoutGrid },
  { to: '/portal/devis', label: 'Devis', icon: FileText },
  { to: '/portal/commission', label: 'Commission', icon: Euro },
  { to: '/portal/documents', label: 'Documents', icon: FolderOpen },
  { to: '/portal/reviews', label: 'Avis Google', icon: Star },
  { to: '/portal/parametres', label: 'Paramètres', icon: Settings },
] as const

type SidebarContentProps = {
  route: string
  initials: string
  fullName: string | undefined
  companyName: string | undefined
  onSignOut: () => void
  onNavigate?: () => void
}

function SidebarContent({ route, initials, fullName, companyName, onSignOut, onNavigate }: SidebarContentProps) {
  return (
    <>
      <div className="flex items-center border-b border-[var(--gray-100)] px-5 py-4">
        <img src="/logocelexia.png" alt="Celexia" className="h-7 w-auto" />
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        <div className="px-6 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--gray-400)]">
          Espace artisan
        </div>
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const isActive = route === to
            || (to === '/portal/leads' && route.startsWith('/portal/leads/'))
            || (to === '/portal/devis' && route.startsWith('/portal/devis'))
          return (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              className={`mx-2.5 mt-1 flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-[var(--violet-50)] font-semibold text-[var(--violet-700)]'
                  : 'font-medium text-[var(--gray-600)] hover:bg-[var(--gray-100)] hover:text-[var(--gray-900)]'
              }`}
            >
              <Icon size={18} className="shrink-0" style={{ color: isActive ? 'var(--violet-600)' : undefined }} />
              <span>{label}</span>
            </NavLink>
          )
        })}
      </nav>
      <div className="border-t border-[var(--gray-100)] p-3">
        <div className="flex items-center gap-2.5 rounded-lg p-2">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, var(--violet-400), var(--violet-600))' }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-[var(--gray-900)]">{fullName}</div>
            <div className="truncate text-[11px] text-[var(--gray-500)]">{companyName}</div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            title="Se déconnecter"
            aria-label="Se déconnecter"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--gray-500)] hover:bg-[var(--gray-100)] hover:text-[var(--gray-900)]"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  )
}

export function PortalLayout() {
  const { profile, client, signOut } = usePortalAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const route = location.pathname
  const [pwdOpen, setPwdOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isFounder = profile?.role === 'fondateur' || profile?.role === 'co_fondateur'
  const isViewAs = isFounder && typeof window !== 'undefined' && !!sessionStorage.getItem('portal_view_as_client')

  usePortalShortcuts()

  const handleSignOut = async () => {
    setSidebarOpen(false)
    await signOut()
    navigate('/portal/auth')
  }

  function exitViewAsMode() {
    try { sessionStorage.removeItem('portal_view_as_client') } catch { /* noop */ }
    navigate('/dashboard')
  }

  const initials = profile?.full_name
    ?.trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w: string) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'

  const currentLabel = NAV_ITEMS.find(n => route.startsWith(n.to))?.label || 'Page'

  return (
    <div className="portal-root">
      <div className="flex min-h-screen bg-[var(--gray-50)]">
        {/* Sidebar desktop (xl+). Avant : md+ mais sur 800-1024px la sidebar
            volait ~240px de viewport et tronquait les cards kanban (bug
            audit Cowork Mn4/Mn3). On la cache jusqu'à xl (1280px). */}
        <aside
          className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col border-r border-[var(--gray-200)] bg-white xl:flex"
          aria-label="Navigation principale"
        >
          <SidebarContent
            route={route}
            initials={initials}
            fullName={profile?.full_name}
            companyName={client?.company_name}
            onSignOut={handleSignOut}
          />
        </aside>

        {/* Mobile drawer (<md) */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="flex w-[280px] flex-col bg-white p-0 sm:max-w-[280px]"
          >
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="portal-root flex h-full flex-col" style={{ background: 'white' }}>
              <SidebarContent
                route={route}
                initials={initials}
                fullName={profile?.full_name}
                companyName={client?.company_name}
                onSignOut={handleSignOut}
                onNavigate={() => setSidebarOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="flex min-h-12 items-center justify-between gap-2 border-b border-[var(--gray-200)] bg-white px-3 py-2 sm:min-h-14 sm:px-4 md:px-6 md:py-3.5">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {/* Hamburger (mobile + tablet, jusqu'à xl) */}
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[var(--gray-700)] hover:bg-[var(--gray-100)] xl:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Ouvrir le menu"
              >
                <Menu size={20} />
              </button>
              <div className="min-w-0 truncate text-xs text-[var(--gray-500)] sm:text-[13px]">
                <span className="hidden sm:inline">Espace artisan · </span>
                <span className="font-medium text-[var(--gray-700)]">{currentLabel}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              <button
                type="button"
                onClick={() => setPwdOpen(true)}
                title="Changer mon mot de passe"
                aria-label="Changer mon mot de passe"
                className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--gray-600)] hover:bg-[var(--gray-100)] sm:h-10 sm:w-10"
              >
                <KeyRound size={18} />
              </button>
            </div>
          </header>

          {/* View-as banner */}
          {isViewAs && (
            <div
              role="region"
              aria-label="Mode visualisation"
              className="flex flex-col items-start justify-between gap-1.5 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:flex-row sm:items-center sm:gap-2 sm:px-6 sm:py-2.5 sm:text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                <span>
                  <strong className="font-semibold">Mode visualisation</strong>
                  {client?.company_name && (
                    <> · <strong className="font-semibold">{client.company_name}</strong></>
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={exitViewAsMode}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-amber-200/60 px-2.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-200 sm:h-8 sm:text-xs"
              >
                Sortir
              </button>
            </div>
          )}

          {/* Page content — compacté sur mobile */}
          <main className="flex-1 overflow-x-hidden p-3 sm:p-4 md:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>

      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
    </div>
  )
}
