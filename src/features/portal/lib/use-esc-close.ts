import { useEffect } from 'react'

/**
 * Ferme une modale custom (non shadcn/Radix) sur appui Escape.
 * À appeler dans tout composant qui rend une modale custom basée
 * sur un overlay fixed inset-0.
 */
export function useEscClose(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])
}
