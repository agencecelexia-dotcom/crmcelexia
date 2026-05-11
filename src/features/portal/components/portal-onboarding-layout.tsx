import { useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, KeyRound, LogOut, Loader2 } from 'lucide-react'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { ChangePasswordDialog } from './change-password-dialog'
import '../portal.css'

export function PortalOnboardingLayout() {
  const [pwdOpen, setPwdOpen] = useState(false)
  const { signOut, onboarding, isLoading } = usePortalAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const isHub = location.pathname === '/portal/onboarding/welcome'

  // Si l'onboarding est déjà validé par Celexia, on redirige vers le dashboard
  // (sinon l'artisan reste bloqué sur /portal/onboarding/* après validation).
  // Pendant le chargement initial, on affiche un loader pour ne pas flash le
  // contenu d'onboarding à un artisan déjà validé.
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    )
  }
  if (onboarding?.status === 'validated') {
    return <Navigate to="/portal/dashboard" replace />
  }

  async function handleLogout() {
    await signOut()
    navigate('/portal/auth')
  }

  return (
    <div className="portal-root">
      <div className="flex min-h-screen flex-col bg-gray-50">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 md:px-8 md:py-4">
          <div className="flex min-w-0 items-center gap-3">
            {!isHub && (
              <button
                onClick={() => navigate('/portal/onboarding/welcome')}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 sm:text-sm"
                title="Retour au sommaire"
              >
                <ArrowLeft size={14} />
                <span className="hidden sm:inline">Sommaire</span>
              </button>
            )}
            <img src="/logocelexia.png" alt="Celexia" className="h-6 w-auto sm:h-7" />
          </div>
          <div className="flex flex-shrink-0 items-center gap-1 sm:gap-3">
            <button
              onClick={() => setPwdOpen(true)}
              title="Changer mon mot de passe"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 sm:text-sm"
            >
              <KeyRound size={14} />
              <span className="hidden sm:inline">Mot de passe</span>
            </button>
            <button
              onClick={handleLogout}
              title="Se déconnecter"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 sm:text-sm"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
            <a
              href="mailto:agence.celexia@gmail.com"
              className="hidden text-sm font-semibold text-violet-600 hover:underline lg:inline"
            >
              agence.celexia@gmail.com
            </a>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[880px] flex-1 px-4 py-6 md:px-6 md:py-10">
          <Outlet />
        </main>

        <footer className="border-t border-gray-200 bg-white px-4 py-4 text-center text-xs text-gray-500 md:px-8 md:py-5">
          <div>CELEXIA SASU · SIREN 939 306 429</div>
          <a
            href="mailto:agence.celexia@gmail.com"
            className="mt-1 inline-block text-violet-600 hover:underline lg:hidden"
          >
            Besoin d'aide ? agence.celexia@gmail.com
          </a>
        </footer>
      </div>

      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
    </div>
  )
}
