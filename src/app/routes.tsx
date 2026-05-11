import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/app-layout'
import { ProtectedRoute } from '@/features/auth/components/protected-route'
import { FounderGuard } from '@/features/auth/components/role-guard'
import { LoginPage } from '@/features/auth/pages/login-page'
import { Loader2 } from 'lucide-react'
import { PortalAuthProvider } from '@/features/portal/components/portal-auth-provider'
import { PortalProtectedRoute, PortalValidatedRoute } from '@/features/portal/components/portal-protected-route'
import { PortalOnboardingLayout } from '@/features/portal/components/portal-onboarding-layout'
import { PortalLayout } from '@/features/portal/components/portal-layout'

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
const OpportunitiesHubPage = lazy(() => import('@/features/opportunities/pages/opportunities-hub-page').then(m => ({ default: m.OpportunitiesHubPage })))
const OpportunitiesPage = lazy(() => import('@/features/opportunities/pages/opportunities-page').then(m => ({ default: m.OpportunitiesPage })))
const ContractsPage = lazy(() => import('@/features/contracts/pages/contracts-page').then(m => ({ default: m.ContractsPage })))
const PaymentsPage = lazy(() => import('@/features/payments/pages/payments-page').then(m => ({ default: m.PaymentsPage })))
const PerformancePage = lazy(() => import('@/features/analytics/pages/performance-page').then(m => ({ default: m.PerformancePage })))
const ObjectivesPage = lazy(() => import('@/features/analytics/pages/objectives-page').then(m => ({ default: m.ObjectivesPage })))
const FollowupPage = lazy(() => import('@/features/clients/pages/followup-page').then(m => ({ default: m.FollowupPage })))
const AccompagnementListPage = lazy(() => import('@/features/accompagnement/pages/accompagnement-list-page').then(m => ({ default: m.AccompagnementListPage })))
const NotesPage = lazy(() => import('@/features/notes/pages/notes-page').then(m => ({ default: m.NotesPage })))
const RemindersPage = lazy(() => import('@/features/reminders/pages/reminders-page').then(m => ({ default: m.RemindersPage })))
const MyPipelinePage = lazy(() => import('@/features/pipeline/pages/my-pipeline-page').then(m => ({ default: m.MyPipelinePage })))

// Portal pages
const PortalLoginPage = lazy(() => import('@/features/portal/pages/portal-login-page').then(m => ({ default: m.PortalLoginPage })))
const WelcomePage = lazy(() => import('@/features/portal/pages/onboarding/welcome-page').then(m => ({ default: m.WelcomePage })))
const ContractPage = lazy(() => import('@/features/portal/pages/onboarding/contract-page').then(m => ({ default: m.ContractPage })))
const PaymentPage = lazy(() => import('@/features/portal/pages/onboarding/payment-page').then(m => ({ default: m.PaymentPage })))
const GmbPage = lazy(() => import('@/features/portal/pages/onboarding/gmb-page').then(m => ({ default: m.GmbPage })))
const LegalPage = lazy(() => import('@/features/portal/pages/onboarding/legal-page').then(m => ({ default: m.LegalPage })))
const PendingPage = lazy(() => import('@/features/portal/pages/onboarding/pending-page').then(m => ({ default: m.PendingPage })))
const PortalDashboardPage = lazy(() => import('@/features/portal/pages/dashboard-page').then(m => ({ default: m.PortalDashboardPage })))
const PortalLeadsKanbanPage = lazy(() => import('@/features/portal/pages/leads-kanban-page').then(m => ({ default: m.PortalLeadsKanbanPage })))
const PortalLeadDetailPage = lazy(() => import('@/features/portal/pages/lead-detail-page').then(m => ({ default: m.PortalLeadDetailPage })))
const PortalCommissionPage = lazy(() => import('@/features/portal/pages/commission-page').then(m => ({ default: m.PortalCommissionPage })))
const PortalDocumentsPage = lazy(() => import('@/features/portal/pages/documents-page').then(m => ({ default: m.PortalDocumentsPage })))
const PortalSettingsPage = lazy(() => import('@/features/portal/pages/settings-page').then(m => ({ default: m.PortalSettingsPage })))
const PortalQuotesListPage = lazy(() => import('@/features/portal/pages/quotes-list-page').then(m => ({ default: m.PortalQuotesListPage })))
const PortalQuoteEditorPage = lazy(() => import('@/features/portal/pages/quote-editor-page').then(m => ({ default: m.PortalQuoteEditorPage })))
const AdminOnboardingsPage = lazy(() => import('@/features/portal-admin/pages/admin-onboardings-page').then(m => ({ default: m.AdminOnboardingsPage })))

// Public RDV action pages (token-based, no auth)
const ConfirmRdvPage = lazy(() => import('@/features/rdv-public/pages/confirm-rdv-page').then(m => ({ default: m.ConfirmRdvPage })))
const CancelRdvPage = lazy(() => import('@/features/rdv-public/pages/cancel-rdv-page').then(m => ({ default: m.CancelRdvPage })))
const RescheduleRdvPage = lazy(() => import('@/features/rdv-public/pages/reschedule-rdv-page').then(m => ({ default: m.RescheduleRdvPage })))

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
  // ── Public RDV actions (token-based, pas d'auth, route depuis emails) ──
  { path: '/rdv/confirmer', element: <LazyPage><ConfirmRdvPage /></LazyPage> },
  { path: '/rdv/annuler', element: <LazyPage><CancelRdvPage /></LazyPage> },
  { path: '/rdv/replanifier', element: <LazyPage><RescheduleRdvPage /></LazyPage> },

  // ── Portal artisan (separate auth flow) ──
  {
    path: '/portal/auth',
    element: <LazyPage><PortalLoginPage /></LazyPage>,
  },
  {
    element: <PortalAuthProvider><PortalProtectedRoute /></PortalAuthProvider>,
    children: [
      // Onboarding flow (no sidebar, light header)
      {
        element: <PortalOnboardingLayout />,
        children: [
          { path: '/portal/onboarding/welcome', element: <LazyPage><WelcomePage /></LazyPage> },
          { path: '/portal/onboarding/contract', element: <LazyPage><ContractPage /></LazyPage> },
          { path: '/portal/onboarding/payment', element: <LazyPage><PaymentPage /></LazyPage> },
          { path: '/portal/onboarding/gmb', element: <LazyPage><GmbPage /></LazyPage> },
          { path: '/portal/onboarding/legal', element: <LazyPage><LegalPage /></LazyPage> },
          { path: '/portal/onboarding/pending', element: <LazyPage><PendingPage /></LazyPage> },
        ],
      },
      // Dashboard + CRM artisan (nav header, requires validated onboarding)
      {
        element: <PortalValidatedRoute />,
        children: [
          {
            element: <PortalLayout />,
            children: [
              { path: '/portal/dashboard', element: <LazyPage><PortalDashboardPage /></LazyPage> },
              { path: '/portal/leads', element: <LazyPage><PortalLeadsKanbanPage /></LazyPage> },
              { path: '/portal/leads/:id', element: <LazyPage><PortalLeadDetailPage /></LazyPage> },
              { path: '/portal/commission', element: <LazyPage><PortalCommissionPage /></LazyPage> },
              { path: '/portal/documents', element: <LazyPage><PortalDocumentsPage /></LazyPage> },
              { path: '/portal/devis', element: <LazyPage><PortalQuotesListPage /></LazyPage> },
              { path: '/portal/devis/nouveau', element: <LazyPage><PortalQuoteEditorPage /></LazyPage> },
              { path: '/portal/devis/:id', element: <LazyPage><PortalQuoteEditorPage /></LazyPage> },
              { path: '/portal/parametres', element: <LazyPage><PortalSettingsPage /></LazyPage> },
            ],
          },
        ],
      },
    ],
  },
  // ── CRM interne ──
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
            element: <LazyPage><OpportunitiesHubPage /></LazyPage>,
          },
          {
            path: '/opportunities/site-web',
            element: <LazyPage><OpportunitiesPage opportunityType="site_web" /></LazyPage>,
          },
          {
            path: '/opportunities/pub',
            element: <LazyPage><OpportunitiesPage opportunityType="pub" /></LazyPage>,
          },
          // Mon Pipeline (all users)
          {
            path: '/mon-pipeline',
            element: <LazyPage><MyPipelinePage /></LazyPage>,
          },
          // Notes equipe (all users)
          {
            path: '/notes',
            element: <LazyPage><NotesPage /></LazyPage>,
          },
          // Rappels centralises (all users)
          {
            path: '/rappels',
            element: <LazyPage><RemindersPage /></LazyPage>,
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
                path: '/accompagnement',
                element: <LazyPage><AccompagnementListPage /></LazyPage>,
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
              // Portal admin
              {
                path: '/onboardings',
                element: <LazyPage><AdminOnboardingsPage /></LazyPage>,
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
