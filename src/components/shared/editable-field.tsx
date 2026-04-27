import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pencil, Check, X, Loader2 } from 'lucide-react'

interface Props {
  label: string
  value: string | null
  type?: 'text' | 'email' | 'tel' | 'url'
  placeholder?: string
  onSave: (newValue: string | null) => Promise<void>
  /** Si fourni, valide la valeur. Retourne un message d'erreur ou null si OK. */
  validate?: (value: string) => string | null
  /** Si false, le champ n'est pas éditable (read-only display). */
  editable?: boolean
  /** Affiche en mono (pour téléphones, SIRET, etc.) */
  mono?: boolean
}

/**
 * Champ texte avec édition inline : clic pour éditer, Enter ou blur pour sauver,
 * Escape pour annuler. Indique le statut (loading / erreur) visuellement.
 */
export function EditableField({
  label,
  value,
  type = 'text',
  placeholder = '—',
  onSave,
  validate,
  editable = true,
  mono = false,
}: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  useEffect(() => {
    if (isEditing) inputRef.current?.focus()
  }, [isEditing])

  async function commit() {
    const trimmed = draft.trim()
    const oldValue = value ?? ''
    if (trimmed === oldValue.trim()) {
      setIsEditing(false)
      return
    }
    if (validate) {
      const err = validate(trimmed)
      if (err) {
        setError(err)
        return
      }
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(trimmed === '' ? null : trimmed)
      setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(value ?? '')
    setError(null)
    setIsEditing(false)
  }

  if (!editable) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <p className={`text-sm ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
      </div>
    )
  }

  if (!isEditing) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="group flex items-center gap-2 text-left text-sm hover:bg-muted/50 -ml-1 -mt-1 px-1 py-0.5 rounded transition w-full min-h-[28px]"
        >
          <span className={`${mono ? 'font-mono' : ''} ${!value ? 'text-muted-foreground italic' : ''}`}>
            {value || placeholder}
          </span>
          <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(null) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { e.preventDefault(); cancel() }
          }}
          onBlur={commit}
          className={`h-8 ${mono ? 'font-mono' : ''}`}
          disabled={saving}
        />
        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {!saving && (
          <>
            <button type="button" onMouseDown={(e) => { e.preventDefault(); commit() }} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
              <Check className="h-4 w-4" />
            </button>
            <button type="button" onMouseDown={(e) => { e.preventDefault(); cancel() }} className="p-1 text-muted-foreground hover:bg-muted rounded">
              <X className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
