import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react'

interface UndoAction {
  label: string
  undo: () => Promise<void>
}

interface UndoContextType {
  undoAction: UndoAction | null
  setUndoAction: (action: UndoAction) => void
  clearUndo: () => void
}

const UndoContext = createContext<UndoContextType | null>(null)

export function UndoProvider({ children }: { children: ReactNode }) {
  const [undoAction, setUndoState] = useState<UndoAction | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const setUndoAction = useCallback((action: UndoAction) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setUndoState(action)
    timerRef.current = setTimeout(() => setUndoState(null), 5 * 60 * 1000)
  }, [])

  const clearUndo = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setUndoState(null)
  }, [])

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  return (
    <UndoContext.Provider value={{ undoAction, setUndoAction, clearUndo }}>
      {children}
    </UndoContext.Provider>
  )
}

export function useUndo() {
  const ctx = useContext(UndoContext)
  if (!ctx) throw new Error('useUndo must be used within UndoProvider')
  return ctx
}
