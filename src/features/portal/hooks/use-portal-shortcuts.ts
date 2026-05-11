import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Raccourcis clavier globaux du portail artisan.
 *
 * Pattern "g + lettre" inspiré de GitHub/Linear : on appuie sur `g` puis
 * sur une lettre dans la seconde qui suit, et on navigue.
 *
 * Raccourcis disponibles :
 *   g d  → /portal/dashboard
 *   g l  → /portal/leads
 *   g c  → /portal/commission
 *   g f  → /portal/documents (f for files)
 *
 * Désactivé automatiquement quand l'utilisateur est en train d'écrire
 * dans un input/textarea/contenteditable, ou quand un modificateur
 * (Ctrl/Meta/Alt) est actif.
 */
export function usePortalShortcuts() {
  const navigate = useNavigate()
  const gPressedAtRef = useRef<number | null>(null)

  useEffect(() => {
    const ROUTES: Record<string, string> = {
      d: '/portal/dashboard',
      l: '/portal/leads',
      c: '/portal/commission',
      f: '/portal/documents',
    }
    const WINDOW_MS = 1000

    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (target.isContentEditable) return true
      return false
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(e.target)) return

      const key = e.key.toLowerCase()
      const now = Date.now()

      // Phase 2 : on attend la lettre de destination
      if (gPressedAtRef.current && now - gPressedAtRef.current <= WINDOW_MS) {
        const dest = ROUTES[key]
        gPressedAtRef.current = null
        if (dest) {
          e.preventDefault()
          navigate(dest)
        }
        return
      }

      // Phase 1 : "g" qui initie la séquence
      if (key === 'g') {
        gPressedAtRef.current = now
        return
      }

      // Toute autre touche reset la séquence
      gPressedAtRef.current = null
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])
}
