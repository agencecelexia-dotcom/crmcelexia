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

// Strength minimal : ≥12 chars + au moins 1 chiffre + 1 lettre.
// Pas de fancy meter pour éviter d'embarquer zxcvbn. Suffisant contre
// les mots de passe triviaux (12345678, password, vincent1234, etc.).
function checkPasswordStrength(pw: string): { valid: boolean; reason: string } {
  if (pw.length < 12) return { valid: false, reason: '12 caractères minimum' }
  if (!/\d/.test(pw)) return { valid: false, reason: 'Au moins 1 chiffre requis' }
  if (!/[a-zA-Zà-ÿÀ-Ÿ]/.test(pw)) return { valid: false, reason: 'Au moins 1 lettre requise' }
  return { valid: true, reason: '' }
}

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  useEscClose(open, () => onOpenChange(false))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const strength = checkPasswordStrength(password)
    if (!strength.valid) { toast.error(strength.reason); return }
    if (password !== confirm) { toast.error('Les mots de passe ne correspondent pas'); return }
    if (!currentPassword) { toast.error('Mot de passe actuel requis'); return }
    setSaving(true)
    try {
      // Re-authentifie avec le mot de passe actuel avant d'autoriser le change.
      // Évite les session-hijack : un attaquant qui prend une session active
      // ne peut pas verrouiller le propriétaire dehors sans connaître l'ancien
      // mot de passe.
      const { data: sessionData } = await supabase.auth.getSession()
      const userEmail = sessionData.session?.user?.email
      if (!userEmail) { toast.error('Session invalide'); setSaving(false); return }
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword,
      })
      if (reauthError) { toast.error('Mot de passe actuel incorrect'); setSaving(false); return }

      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      toast.success('Mot de passe modifié avec succès')
      setCurrentPassword('')
      setPassword('')
      setConfirm('')
      onOpenChange(false)
    } catch (err) {
      toast.error(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  const strength = password ? checkPasswordStrength(password) : { valid: false, reason: '' }

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
              <label className="label-input" htmlFor="cpw-current">Mot de passe actuel *</label>
              <input
                id="cpw-current"
                className="input"
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Votre mot de passe actuel"
                style={{ fontSize: 16 }}
                autoFocus
                required
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="label-input" htmlFor="cpw-new">Nouveau mot de passe *</label>
              <input
                id="cpw-new"
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="12 caractères, 1 lettre, 1 chiffre minimum"
                style={{ fontSize: 16 }}
                required
                minLength={12}
                autoComplete="new-password"
                aria-describedby="cpw-strength"
              />
              {password && (
                <p id="cpw-strength" role={strength.valid ? undefined : 'alert'}
                   className={`mt-1.5 text-xs ${strength.valid ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {strength.valid ? '✓ Mot de passe valide' : strength.reason}
                </p>
              )}
            </div>
            <div>
              <label className="label-input" htmlFor="cpw-confirm">Confirmer le nouveau mot de passe *</label>
              <input
                id="cpw-confirm"
                className="input"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Retapez le nouveau mot de passe"
                style={{ fontSize: 16 }}
                required
                autoComplete="new-password"
              />
              {confirm && password !== confirm && (
                <p role="alert" className="mt-1.5 text-xs text-amber-600">
                  Les mots de passe ne correspondent pas
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 rounded-b-2xl border-t border-[var(--gray-100)] bg-[var(--gray-50)] p-4 sm:flex-row sm:justify-end sm:gap-2.5 sm:p-4">
            <button type="button" className="btn btn-ghost w-full sm:w-auto" onClick={() => onOpenChange(false)}>
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-primary w-full sm:w-auto"
              disabled={saving || !currentPassword || !password || !confirm || !strength.valid || password !== confirm}
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
