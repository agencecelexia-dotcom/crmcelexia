import { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { usePortalShortcuts } from '../hooks/use-portal-shortcuts'
import { Home, LayoutGrid, Euro, FolderOpen, KeyRound, LogOut, Bell } from 'lucide-react'
import { ChangePasswordDialog } from './change-password-dialog'
import '../portal.css'

const NAV_ITEMS = [
  { to: '/portal/dashboard', label: 'Dashboard', icon: Home },
  { to: '/portal/leads', label: 'Leads', icon: LayoutGrid },
  { to: '/portal/commission', label: 'Commission', icon: Euro },
  { to: '/portal/documents', label: 'Documents', icon: FolderOpen },
] as const

export function PortalLayout() {
  const { profile, client, signOut } = usePortalAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const route = location.pathname
  const [pwdOpen, setPwdOpen] = useState(false)

  // Mode "view as" pour fondateurs
  const isFounder = profile?.role === 'fondateur' || profile?.role === 'co_fondateur'
  const isViewAs = isFounder && typeof window !== 'undefined' && !!sessionStorage.getItem('portal_view_as_client')

  usePortalShortcuts()

  const handleSignOut = async () => {
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
        {/* Sidebar — toujours visible. Compact (icons only) sur mobile, large sur desktop. */}
        <aside
          className="sticky top-0 flex h-screen w-[64px] shrink-0 flex-col border-r border-[var(--gray-200)] bg-white md:w-[240px]"
          aria-label="Navigation principale"
        >
          {/* Logo */}
          <div className="flex items-center justify-center border-b border-[var(--gray-100)] px-3 py-4 md:justify-start md:px-5 md:py-[18px]">
            <img src="/logocelexia.png" alt="Celexia" className="h-7 w-auto" />
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto py-3">
            <div className="hidden px-6 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--gray-400)] md:block">
              Espace artisan
            </div>
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
              const isActive = route === to || (to === '/portal/leads' && route.startsWith('/portal/leads/'))
              return (
                <NavLink
                  key={to}
                  to={to}
                  title={label}
                  aria-label={label}
                  className={`mx-2 mt-1 flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors md:mx-2.5 md:py-2 ${
                    isActive
                      ? 'bg-[var(--violet-50)] text-[var(--violet-700)]'
                      : 'text-[var(--gray-600)] hover:bg-[var(--gray-100)] hover:text-[var(--gray-900)]'
                  }`}
                  style={isActive ? { fontWeight: 600 } : undefined}
                >
                  <Icon size={20} className="shrink-0" style={{ color: isActive ? 'var(--violet-600)' : undefined }} />
                  <span className="hidden md:inline">{label}</span>
                </NavLink>
              )
            })}
          </nav>

          {/* User footer */}
          <div className="border-t border-[var(--gray-100)] p-2 md:p-3">
            {/* Compact (mobile) : juste avatar + logout */}
            <div className="flex flex-col items-center gap-2 md:hidden">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: 'linear-gradient(135deg, var(--violet-400), var(--violet-600))' }}
                title={profile?.full_name ?? ''}
              >
                {initials}
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                title="Se déconnecter"
                aria-label="Se déconnecter"
                className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--gray-500)] hover:bg-[var(--gray-100)] hover:text-[var(--gray-900)]"
              >
                <LogOut size={16} />
              </button>
            </div>

            {/* Large (desktop) : avatar + nom + entreprise + logout */}
            <div className="hidden items-center gap-2.5 rounded-lg p-2 md:flex">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: 'linear-gradient(135deg, var(--violet-400), var(--violet-600))' }}
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-[var(--gray-900)]">{profile?.full_name}</div>
                <div className="truncate text-[11px] text-[var(--gray-500)]">{client?.company_name}</div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                title="Se déconnecter"
                aria-label="Se déconnecter"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--gray-500)] hover:bg-[var(--gray-100)] hover:text-[var(--gray-900)]"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="flex min-h-14 items-center justify-between gap-2 border-b border-[var(--gray-200)] bg-white px-4 py-3 md:px-6 md:py-3.5">
            <div className="min-w-0 flex-1 truncate text-[13px] text-[var(--gray-500)]">
              <span className="hidden sm:inline">Espace artisan · </span>
              <span className="font-medium text-[var(--gray-700)]">{currentLabel}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="Notifications"
                className="relative flex h-10 w-10 items-center justify-center rounded-md text-[var(--gray-600)] hover:bg-[var(--gray-100)]"
              >
                <Bell size={18} />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-red-600" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setPwdOpen(true)}
                title="Changer mon mot de passe"
                aria-label="Changer mon mot de passe"
                className="flex h-10 w-10 items-center justify-center rounded-md text-[var(--gray-600)] hover:bg-[var(--gray-100)]"
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
              className="flex flex-col items-start justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:flex-row sm:items-center sm:px-6"
            >
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                <span>
                  <strong className="font-semibold">Mode visualisation</strong>
                  {client?.company_name && (
                    <> · vous voyez le portail de <strong className="font-semibold">{client.company_name}</strong></>
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={exitViewAsMode}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-amber-200/60 px-3 text-xs font-semibold text-amber-900 hover:bg-amber-200"
              >
                Sortir du mode
              </button>
            </div>
          )}

          {/* Page content */}
          <main className="flex-1 overflow-x-hidden p-4 md:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>

      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
    </div>
  )
}
