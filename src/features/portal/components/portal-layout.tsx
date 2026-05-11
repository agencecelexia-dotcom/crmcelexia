import { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { usePortalShortcuts } from '../hooks/use-portal-shortcuts'
import { Home, LayoutGrid, Euro, FolderOpen, KeyRound, LogOut, Bell, Sparkles, Menu } from 'lucide-react'
import { ChangePasswordDialog } from './change-password-dialog'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import '../portal.css'

const NAV_ITEMS = [
  { to: '/portal/dashboard', label: 'Dashboard', icon: Home },
  { to: '/portal/leads', label: 'Leads', icon: LayoutGrid, badge: true },
  { to: '/portal/commission', label: 'Commission', icon: Euro },
  { to: '/portal/documents', label: 'Documents', icon: FolderOpen },
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
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--gray-100)' }}>
        <img src="/logocelexia.png" alt="Celexia" style={{ height: 28, width: 'auto' }} />
      </div>

      {/* Nav items */}
      <div style={{ padding: '14px 0', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gray-400)', padding: '4px 24px 8px' }}>
          Espace artisan
        </div>
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const isActive = route === to || (to === '/portal/leads' && route.startsWith('/portal/leads/'))
          return (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', margin: '2px 10px',
                borderRadius: 'var(--radius-md)',
                color: isActive ? 'var(--violet-700)' : 'var(--gray-600)',
                fontSize: 14, fontWeight: isActive ? 600 : 500,
                background: isActive ? 'var(--violet-50)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.15s',
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              <Icon size={18} style={{ color: isActive ? 'var(--violet-600)' : undefined }} />
              <span>{label}</span>
            </NavLink>
          )
        })}

        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gray-400)', padding: '20px 24px 8px' }}>
          Parcours client
        </div>
        <NavLink
          to="/portal/onboarding/welcome"
          onClick={onNavigate}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', margin: '2px 10px', borderRadius: 'var(--radius-md)', color: 'var(--gray-600)', fontSize: 14, fontWeight: 500, textDecoration: 'none', minHeight: 44 }}
        >
          <Sparkles size={18} /><span>Onboarding (demo)</span>
        </NavLink>
      </div>

      {/* User footer */}
      <div style={{ padding: 14, borderTop: '1px solid var(--gray-100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--violet-400), var(--violet-600))',
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 13,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-900)' }}>{fullName}</div>
            <div style={{ fontSize: 11, color: 'var(--gray-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {companyName}
            </div>
          </div>
          <button
            onClick={onSignOut}
            title="Se déconnecter"
            aria-label="Se déconnecter"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 10, color: 'var(--gray-500)', minWidth: 40, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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

  // Mode "view as" : un fondateur visualise le portail d'un artisan via
  // sessionStorage portal_view_as_client. On affiche un bandeau pour éviter
  // toute confusion (le fondateur pourrait croire qu'il agit sur SON compte).
  const isFounder = profile?.role === 'fondateur' || profile?.role === 'co_fondateur'
  const isViewAs = isFounder && typeof window !== 'undefined' && !!sessionStorage.getItem('portal_view_as_client')

  // Raccourcis clavier globaux : g+d (dashboard), g+l (leads), g+c (commission), g+f (documents)
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
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--gray-50)' }}>
        {/* Desktop sidebar (hidden on mobile) */}
        <aside
          className="hidden md:flex"
          style={{
            width: 240, background: 'white', borderRight: '1px solid var(--gray-200)',
            flexDirection: 'column', flexShrink: 0,
            position: 'sticky', top: 0, height: '100vh',
          }}
        >
          <SidebarContent
            route={route}
            initials={initials}
            fullName={profile?.full_name}
            companyName={client?.company_name}
            onSignOut={handleSignOut}
          />
        </aside>

        {/* Mobile drawer sidebar */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="p-0 w-[280px] sm:max-w-[280px] flex flex-col bg-white"
          >
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="portal-root flex flex-col h-full" style={{ background: 'white' }}>
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

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Topbar */}
          <div
            className="px-4 py-3 md:px-6 md:py-4 xl:py-2.5 min-h-16 xl:min-h-14"
            style={{
              background: 'white', borderBottom: '1px solid var(--gray-200)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
              {/* Hamburger (mobile only) */}
              <button
                type="button"
                className="md:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Ouvrir le menu"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--gray-700)',
                  width: 40, height: 40, minWidth: 40, minHeight: 40,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 'var(--radius-md)',
                  flexShrink: 0,
                }}
              >
                <Menu size={20} />
              </button>
              <div style={{ fontSize: 13, color: 'var(--gray-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                <span className="hidden sm:inline">Espace artisan · </span>
                <span style={{ fontWeight: 500, color: 'var(--gray-700)' }}>{currentLabel}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button
                type="button"
                aria-label="Notifications"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  position: 'relative', color: 'var(--gray-600)',
                  width: 40, height: 40, minWidth: 40, minHeight: 40,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <Bell size={18} />
                <span style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: '#DC2626', border: '2px solid white' }} />
              </button>
              <button
                type="button"
                onClick={() => setPwdOpen(true)}
                title="Changer mon mot de passe"
                aria-label="Changer mon mot de passe"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--gray-600)',
                  width: 40, height: 40, minWidth: 40, minHeight: 40,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <KeyRound size={18} />
              </button>
            </div>
          </div>

          {/* View-as banner (fondateurs uniquement) */}
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
          <div className="p-4 md:p-6 lg:p-8" style={{ flex: 1, overflowX: 'hidden' }}>
            <Outlet />
          </div>
        </div>
      </div>

      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
    </div>
  )
}
