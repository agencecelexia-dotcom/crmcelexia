import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/use-auth'
import { Loader2 } from 'lucide-react'

export function ProtectedRoute() {
  const { session, profile, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  // Session exists but profile failed to load — show a retry option
  if (!profile) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-sm text-muted-foreground">
          Impossible de charger votre profil. Verifiez votre connexion internet.
        </p>
        <button
          className="text-sm text-primary underline hover:no-underline"
          onClick={() => window.location.reload()}
        >
          Recharger la page
        </button>
      </div>
    )
  }

  return <Outlet />
}
