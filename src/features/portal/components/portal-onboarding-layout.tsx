import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { KeyRound, LogOut } from 'lucide-react'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { ChangePasswordDialog } from './change-password-dialog'
import '../portal.css'

export function PortalOnboardingLayout() {
  const [pwdOpen, setPwdOpen] = useState(false)
  const { signOut } = usePortalAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await signOut()
    navigate('/portal/auth')
  }

  return (
    <div className="portal-root">
      <div className="onb-shell">
        {/* Header — exact copy from mockup */}
        <header className="onb-header">
          <img src="/logocelexia.png" alt="Celexia" style={{ height: 28, width: 'auto' }} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={() => setPwdOpen(true)}
              title="Changer mon mot de passe"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--gray-500)', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            >
              <KeyRound size={14} /> Mot de passe
            </button>
            <button
              onClick={handleLogout}
              title="Se déconnecter"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--gray-500)', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            >
              <LogOut size={14} /> Déconnexion
            </button>
            <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>Besoin d'aide ?</span>
            <a href="mailto:agence.celexia@gmail.com" style={{ fontSize: 13, color: 'var(--violet-600)', fontWeight: 600, textDecoration: 'none' }}>
              agence.celexia@gmail.com
            </a>
          </div>
        </header>

        {/* Main content — centered, max-width 880px like mockup */}
        <main className="onb-main">
          <Outlet />
        </main>

        {/* Footer */}
        <footer style={{ padding: '20px 32px', borderTop: '1px solid var(--gray-200)', background: 'white', textAlign: 'center', fontSize: 12, color: 'var(--gray-500)' }}>
          CELEXIA SASU · SIREN 939 306 429
        </footer>
      </div>

      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
    </div>
  )
}
