import { Outlet } from 'react-router-dom'
import '../portal.css'

export function PortalOnboardingLayout() {
  return (
    <div className="portal-root">
      <div className="onb-shell">
        {/* Header — exact copy from mockup */}
        <header className="onb-header">
          <img src="/logocelexia.png" alt="Celexia" style={{ height: 28, width: 'auto' }} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
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
          Celexia · LEIA SASU · SIREN 939 306 429
        </footer>
      </div>
    </div>
  )
}
