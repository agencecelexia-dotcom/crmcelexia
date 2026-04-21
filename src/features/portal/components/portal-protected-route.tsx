import { Navigate, Outlet } from 'react-router-dom'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { Loader2 } from 'lucide-react'

/** Protects portal routes — requires artisan role */
export function PortalProtectedRoute() {
  const { session, profile, isLoading } = usePortalAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    )
  }

  if (!session || !profile) {
    return <Navigate to="/portal/auth" replace />
  }

  if (profile.role !== 'artisan') {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

/** Protects dashboard routes — requires validated onboarding */
export function PortalValidatedRoute() {
  const { onboarding, isLoading } = usePortalAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    )
  }

  if (!onboarding || onboarding.status !== 'validated') {
    return <Navigate to="/portal/onboarding/welcome" replace />
  }

  return <Outlet />
}
