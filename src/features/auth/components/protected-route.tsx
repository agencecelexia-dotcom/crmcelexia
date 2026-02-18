import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/use-auth'
import { supabaseMisconfigured } from '@/lib/supabase/client'
import { Loader2, AlertTriangle } from 'lucide-react'

export function ProtectedRoute() {
  const { session, profile, isLoading } = useAuth()

  if (supabaseMisconfigured) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-center px-4">
        <AlertTriangle className="h-12 w-12 text-orange-500" />
        <h1 className="text-xl font-bold">Configuration manquante</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          Les variables d'environnement Supabase ne sont pas configurees.
          Ajoutez <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">VITE_SUPABASE_URL</code> et{' '}
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">VITE_SUPABASE_ANON_KEY</code>{' '}
          dans les parametres de votre deploiement Vercel, puis relancez le build.
        </p>
      </div>
    )
  }

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
