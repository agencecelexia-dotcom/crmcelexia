import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/app-layout'
import { ProtectedRoute } from '@/features/auth/components/protected-route'
import { FounderGuard } from '@/features/auth/components/role-guard'
import { LoginPage } from '@/features/auth/pages/login-page'
import { Loader2 } from 'lucide-react'

// Lazy-loaded pages for code splitting
const DashboardPage = lazy(() => import('@/features/dashboard/pages/dashboard-page').then(m => ({ default: m.DashboardPage })))
const ProspectsListPage = lazy(() => import('@/features/prospection/pages/prospects-list-page').then(m => ({ default: m.ProspectsListPage })))
const ProspectDetailPage = lazy(() => import('@/features/prospection/pages/prospect-detail-page').then(m => ({ default: m.ProspectDetailPage })))
const ProspectCreatePage = lazy(() => import('@/features/prospection/pages/prospect-create-page').then(m => ({ default: m.ProspectCreatePage })))
const CsvImportPage = lazy(() => import('@/features/prospection/pages/csv-import-page').then(m => ({ default: m.CsvImportPage })))
const RdvListPage = lazy(() => import('@/features/rendez-vous/pages/rdv-list-page').then(m => ({ default: m.RdvListPage })))
const ClientsListPage = lazy(() => import('@/features/clients/pages/clients-list-page').then(m => ({ default: m.ClientsListPage })))
const ClientDetailPage = lazy(() => import('@/features/clients/pages/client-detail-page').then(m => ({ default: m.ClientDetailPage })))
const BillingListPage = lazy(() => import('@/features/billing/pages/billing-list-page').then(m => ({ default: m.BillingListPage })))
const SettingsPage = lazy(() => import('@/features/settings/pages/settings-page').then(m => ({ default: m.SettingsPage })))
const TeamManagementPage = lazy(() => import('@/features/settings/pages/team-management-page').then(m => ({ default: m.TeamManagementPage })))
const CompanySettingsPage = lazy(() => import('@/features/settings/pages/company-settings-page').then(m => ({ default: m.CompanySettingsPage })))
const TargetsPage = lazy(() => import('@/features/settings/pages/targets-page').then(m => ({ default: m.TargetsPage })))

// New pages
const CalendarPage = lazy(() => import('@/features/calendar/pages/calendar-page').then(m => ({ default: m.CalendarPage })))
const OpportunitiesPage = lazy(() => import('@/features/opportunities/pages/opportunities-page').then(m => ({ default: m.OpportunitiesPage })))
const ContractsPage = lazy(() => import('@/features/contracts/pages/contracts-page').then(m => ({ default: m.ContractsPage })))
const PaymentsPage = lazy(() => import('@/features/payments/pages/payments-page').then(m => ({ default: m.PaymentsPage })))
const PerformancePage = lazy(() => import('@/features/analytics/pages/performance-page').then(m => ({ default: m.PerformancePage })))
const ObjectivesPage = lazy(() => import('@/features/analytics/pages/objectives-page').then(m => ({ default: m.ObjectivesPage })))
const FollowupPage = lazy(() => import('@/features/clients/pages/followup-page').then(m => ({ default: m.FollowupPage })))
const NotesPage = lazy(() => import('@/features/notes/pages/notes-page').then(m => ({ default: m.NotesPage })))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            path: '/',
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: '/dashboard',
            element: <LazyPage><DashboardPage /></LazyPage>,
          },
          // Prospection
          {
            path: '/prospects',
            element: <LazyPage><ProspectsListPage /></LazyPage>,
          },
          {
            path: '/prospects/new',
            element: <LazyPage><ProspectCreatePage /></LazyPage>,
          },
          {
            path: '/prospects/import',
            element: <LazyPage><CsvImportPage /></LazyPage>,
          },
          {
            path: '/prospects/:id',
            element: <LazyPage><ProspectDetailPage /></LazyPage>,
          },
          // Rendez-vous
          {
            path: '/rdv',
            element: <LazyPage><RdvListPage /></LazyPage>,
          },
          // Calendar (all users)
          {
            path: '/calendar',
            element: <LazyPage><CalendarPage /></LazyPage>,
          },
          // Opportunities (all users)
          {
            path: '/opportunities',
            element: <LazyPage><OpportunitiesPage /></LazyPage>,
          },
          // Notes equipe (all users)
          {
            path: '/notes',
            element: <LazyPage><NotesPage /></LazyPage>,
          },
          // Performance (all users)
          {
            path: '/performance',
            element: <LazyPage><PerformancePage /></LazyPage>,
          },
          // Objectives (all users)
          {
            path: '/objectives',
            element: <LazyPage><ObjectivesPage /></LazyPage>,
          },
          // Founder-only routes
          {
            element: <FounderGuard />,
            children: [
              {
                path: '/clients',
                element: <LazyPage><ClientsListPage /></LazyPage>,
              },
              {
                path: '/clients/:id',
                element: <LazyPage><ClientDetailPage /></LazyPage>,
              },
              {
                path: '/billing',
                element: <LazyPage><BillingListPage /></LazyPage>,
              },
              {
                path: '/contracts',
                element: <LazyPage><ContractsPage /></LazyPage>,
              },
              {
                path: '/payments',
                element: <LazyPage><PaymentsPage /></LazyPage>,
              },
              {
                path: '/followup',
                element: <LazyPage><FollowupPage /></LazyPage>,
              },
              {
                path: '/settings/team',
                element: <LazyPage><TeamManagementPage /></LazyPage>,
              },
              {
                path: '/settings/company',
                element: <LazyPage><CompanySettingsPage /></LazyPage>,
              },
              {
                path: '/settings/targets',
                element: <LazyPage><TargetsPage /></LazyPage>,
              },
            ],
          },
          // Settings
          {
            path: '/settings',
            element: <LazyPage><SettingsPage /></LazyPage>,
          },
        ],
      },
    ],
  },
])
