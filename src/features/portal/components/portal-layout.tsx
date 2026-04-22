import { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { Home, LayoutGrid, Euro, FolderOpen, KeyRound, LogOut, Bell, Sparkles } from 'lucide-react'
import { ChangePasswordDialog } from './change-password-dialog'
import '../portal.css'

const NAV_ITEMS = [
  { to: '/portal/dashboard', label: 'Dashboard', icon: Home },
  { to: '/portal/leads', label: 'Leads', icon: LayoutGrid, badge: true },
  { to: '/portal/commission', label: 'Commission', icon: Euro },
  { to: '/portal/documents', label: 'Documents', icon: FolderOpen },
] as const

export function PortalLayout() {
  const { profile, client, signOut } = usePortalAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const route = location.pathname
  const [pwdOpen, setPwdOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/portal/auth')
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <div className="portal-root">
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--gray-50)' }}>
        {/* Sidebar — exact mockup copy */}
        <aside style={{
          width: 240, background: 'white', borderRight: '1px solid var(--gray-200)',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          position: 'sticky', top: 0, height: '100vh',
        }}>
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
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', margin: '2px 10px', borderRadius: 'var(--radius-md)', color: 'var(--gray-600)', fontSize: 14, fontWeight: 500, textDecoration: 'none' }}
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
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-900)' }}>{profile?.full_name}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {client?.company_name}
                </div>
              </div>
              <button
                onClick={handleSignOut}
                title="Se déconnecter"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--gray-500)' }}
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Topbar */}
          <div style={{
            background: 'white', borderBottom: '1px solid var(--gray-200)',
            padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            minHeight: 64,
          }}>
            <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
              Espace artisan · {NAV_ITEMS.find(n => route.startsWith(n.to))?.label || 'Page'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, position: 'relative', color: 'var(--gray-600)' }}>
                <Bell size={18} />
                <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '50%', background: '#DC2626', border: '2px solid white' }} />
              </button>
              <button
                onClick={() => setPwdOpen(true)}
                title="Changer mon mot de passe"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, color: 'var(--gray-600)' }}
              >
                <KeyRound size={18} />
              </button>
            </div>
          </div>

          {/* Page content */}
          <div style={{ padding: 32, flex: 1, overflowX: 'hidden' }}>
            <Outlet />
          </div>
        </div>
      </div>

      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
    </div>
  )
}
