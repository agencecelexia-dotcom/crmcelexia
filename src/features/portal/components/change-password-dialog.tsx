import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { KeyRound, Loader2 } from 'lucide-react'
import { describeError } from '../lib/error-utils'
import { useEscClose } from '../lib/use-esc-close'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  useEscClose(open, () => onOpenChange(false))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { toast.error('8 caractères minimum'); return }
    if (password !== confirm) { toast.error('Les mots de passe ne correspondent pas'); return }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      toast.success('Mot de passe modifié avec succès')
      setPassword('')
      setConfirm('')
      onOpenChange(false)
    } catch (err) {
      toast.error(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="portal-root fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(17,24,39,0.5)] p-4 backdrop-blur-sm sm:p-5"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-[400px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--gray-100)] p-5 sm:p-6">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[var(--violet-100)] text-[var(--violet-600)]">
              <KeyRound size={18} />
            </div>
            <h2 id="change-password-title" className="font-display text-base font-bold sm:text-lg">
              Changer mon mot de passe
            </h2>
          </div>

          <div className="grid flex-1 min-h-0 gap-3.5 overflow-y-auto p-5 sm:p-6">
            <div>
              <label className="label-input" htmlFor="cpw-new">Nouveau mot de passe *</label>
              <input
                id="cpw-new"
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="8 caractères minimum"
                style={{ fontSize: 16 }}
                autoFocus
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="label-input" htmlFor="cpw-confirm">Confirmer le mot de passe *</label>
              <input
                id="cpw-confirm"
                className="input"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Retapez le mot de passe"
                style={{ fontSize: 16 }}
                required
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 rounded-b-2xl border-t border-[var(--gray-100)] bg-[var(--gray-50)] p-4 sm:flex-row sm:justify-end sm:gap-2.5 sm:p-4">
            <button type="button" className="btn btn-ghost w-full sm:w-auto" onClick={() => onOpenChange(false)}>
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-primary w-full sm:w-auto"
              disabled={saving || !password || !confirm}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              {saving ? 'Enregistrement…' : 'Changer le mot de passe'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
