import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { KeyRound, Loader2 } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

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
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20, backdropFilter: 'blur(2px)' }}
      onClick={() => onOpenChange(false)}
    >
      <div
        style={{ background: 'white', borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div style={{ padding: 24, borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--violet-100)', color: 'var(--violet-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <KeyRound size={18} />
            </div>
            <h2 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Changer mon mot de passe</h2>
          </div>
          <div style={{ padding: 24, display: 'grid', gap: 14 }}>
            <div>
              <label className="label-input">Nouveau mot de passe *</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="8 caractères minimum"
                autoFocus
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="label-input">Confirmer le mot de passe *</label>
              <input
                className="input"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Retapez le mot de passe"
                required
              />
            </div>
          </div>
          <div style={{ padding: 18, borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--gray-50)', borderRadius: '0 0 var(--radius-xl) var(--radius-xl)' }}>
            <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !password || !confirm}>
              {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <KeyRound size={16} />}
              {saving ? 'Enregistrement...' : 'Changer le mot de passe'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
