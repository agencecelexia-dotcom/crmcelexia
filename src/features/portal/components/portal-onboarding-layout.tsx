import { Outlet } from 'react-router-dom'

export function PortalOnboardingLayout() {
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {/* Light header for onboarding */}
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <img src="/logocelexia.png" alt="Celexia" className="h-7" />
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">Besoin d'aide ?</span>
            <a href="mailto:agence.celexia@gmail.com" className="font-semibold text-violet-600 hover:underline">
              agence.celexia@gmail.com
            </a>
          </div>
        </div>
      </header>

      {/* Onboarding content — centered, max-width */}
      <main className="mx-auto max-w-3xl px-6 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t bg-white py-4 text-center text-xs text-gray-400">
        Celexia · LEIA SASU · SIREN 939 306 429
      </footer>
    </div>
  )
}
