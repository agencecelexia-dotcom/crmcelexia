import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Home, LayoutGrid, Euro, FolderOpen, LogOut, Settings } from 'lucide-react'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { Button } from '@/components/ui/button'

const NAV_ITEMS = [
  { to: '/portal/dashboard', label: 'Dashboard', icon: Home },
  { to: '/portal/leads', label: 'Leads', icon: LayoutGrid },
  { to: '/portal/commission', label: 'Commission', icon: Euro },
  { to: '/portal/documents', label: 'Documents', icon: FolderOpen },
] as const

export function PortalLayout() {
  const { profile, client, signOut } = usePortalAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/portal/auth')
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src="/logocelexia.png" alt="Celexia" className="h-7" />
            <span className="text-sm font-semibold text-gray-400">Portail client</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-violet-50 text-violet-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-semibold text-gray-900">{profile?.full_name}</p>
              <p className="text-xs text-gray-500">{client?.company_name}</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-violet-600 text-xs font-bold text-white">
              {profile?.full_name?.charAt(0) || '?'}
            </div>
            <Button variant="ghost" size="icon" onClick={handleSignOut} title="Se déconnecter">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/* Mobile nav */}
        <div className="flex md:hidden border-t overflow-x-auto px-2 py-1 gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                  isActive ? 'bg-violet-50 text-violet-700' : 'text-gray-500'
                }`
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </NavLink>
          ))}
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t bg-white py-4 text-center text-xs text-gray-400">
        Celexia — Agence apport d'affaire · <a href="mailto:agence.celexia@gmail.com" className="text-violet-600 hover:underline">agence.celexia@gmail.com</a>
      </footer>
    </div>
  )
}
