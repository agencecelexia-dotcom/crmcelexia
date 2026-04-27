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

  // Mode "view as" : les fondateurs peuvent visualiser le portail si ?as_client=<id>
  const params = new URLSearchParams(window.location.search)
  const isViewAs = !!params.get('as_client') && (profile.role === 'fondateur' || profile.role === 'co_fondateur')

  if (profile.role !== 'artisan' && !isViewAs) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

/** Protects dashboard routes — requires validated onboarding.
 *  Non-validated artisans are redirected to the appropriate onboarding step. */
export function PortalValidatedRoute() {
  const { onboarding, isLoading } = usePortalAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    )
  }

  if (!onboarding) {
    return <Navigate to="/portal/onboarding/welcome" replace />
  }

  if (onboarding.status === 'validated') {
    return <Outlet />
  }

  if (onboarding.status === 'pending_validation') {
    return <Navigate to="/portal/onboarding/pending" replace />
  }

  // in_progress (avec ou sans rejection_reason)
  return <Navigate to="/portal/onboarding/welcome" replace />
}
