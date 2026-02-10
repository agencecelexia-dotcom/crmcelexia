import { RouterProvider } from 'react-router-dom'
import { Providers } from './providers'
import { ErrorBoundary } from '@/components/shared/error-boundary'
import { router } from './routes'

export default function App() {
  return (
    <ErrorBoundary>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </ErrorBoundary>
  )
}
