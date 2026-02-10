import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/use-auth'

export function FounderGuard() {
  const { isFounder, isLoading } = useAuth()

  if (isLoading) return null

  if (!isFounder) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
