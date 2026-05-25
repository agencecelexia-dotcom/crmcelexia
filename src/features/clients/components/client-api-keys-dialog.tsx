import { useState, useEffect, useCallback } from 'react'
import { Key, Plus, Copy, Check, Trash2, AlertTriangle, ExternalLink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  clientId: string
  clientName: string
}

interface ApiKey {
  id: string
  key_prefix: string
  name: string
  last_used_at: string | null
  use_count: number
  created_at: string
  revoked_at: string | null
}

export function ClientApiKeysDialog({ open, onOpenChange, clientId, clientName }: Props) {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [justCreated, setJustCreated] = useState<{ key: string; prefix: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchKeys = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('client_api_keys')
      .select('id, key_prefix, name, last_used_at, use_count, created_at, revoked_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
      toast.error('Impossible de charger les clés API')
      return
    }
    setKeys(data as ApiKey[])
  }, [clientId])

  useEffect(() => {
    if (open) {
      fetchKeys()
      setJustCreated(null)
      setNewKeyName('')
    }
  }, [open, fetchKeys])

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      toast.error('Donnez un nom à la clé (ex "Site renovation-metbach.fr")')
      return
    }
    setCreating(true)
    const { data, error } = await supabase.rpc('generate_client_api_key', {
      p_client_id: clientId,
      p_name: newKeyName.trim(),
    })
    setCreating(false)
    if (error || !data || !data[0]) {
      toast.error(`Erreur création clé : ${error?.message || 'inconnue'}`)
      return
    }
    const row = data[0] as { id: string; key_plaintext: string; key_prefix: string }
    setJustCreated({ key: row.key_plaintext, prefix: row.key_prefix, name: newKeyName.trim() })
    setNewKeyName('')
    fetchKeys()
  }

  const handleCopy = async () => {
    if (!justCreated) return
    await navigator.clipboard.writeText(justCreated.key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRevoke = async (keyId: string, keyName: string) => {
    if (!confirm(`Révoquer la clé "${keyName}" ? Le site qui l'utilise ne pourra plus envoyer de leads.`)) return
    const { error } = await supabase
      .from('client_api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', keyId)
    if (error) {
      toast.error(`Erreur révocation : ${error.message}`)
      return
    }
    toast.success('Clé révoquée')
    fetchKeys()
  }

  const endpointUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/inbound-lead`

  const formatDate = (s: string | null) => {
    if (!s) return '—'
    return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-violet-600" />
            Clés API — {clientName}
          </DialogTitle>
          <DialogDescription>
            Une clé permet à un site web externe (formulaire de devis) d'envoyer des leads
            directement dans le portail de l'artisan.
          </DialogDescription>
        </DialogHeader>

        {/* Endpoint info */}
        <div className="rounded-md bg-slate-50 p-3 text-xs">
          <div className="mb-1 font-semibold text-slate-700">Endpoint à utiliser depuis le site</div>
          <code className="block rounded bg-white px-2 py-1.5 font-mono text-[11px] text-slate-800">
            POST {endpointUrl}
          </code>
        </div>

        {/* Just created — show key in clear once */}
        {justCreated && (
          <div className="rounded-md border-2 border-emerald-300 bg-emerald-50 p-4">
            <div className="mb-2 flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-xs text-emerald-900">
                <strong>Copie cette clé maintenant.</strong> Elle ne sera plus jamais affichée
                en clair. Stocke-la côté serveur du site (env var), <strong>jamais dans le bundle browser</strong>.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-white px-2 py-1.5 font-mono text-xs">
                {justCreated.key}
              </code>
              <Button type="button" size="sm" onClick={handleCopy} variant={copied ? 'default' : 'outline'}>
                {copied ? <><Check className="mr-1 h-3 w-3" /> Copié</> : <><Copy className="mr-1 h-3 w-3" /> Copier</>}
              </Button>
            </div>
          </div>
        )}

        {/* Create new key */}
        <div className="space-y-2">
          <Label htmlFor="newKeyName">Créer une nouvelle clé</Label>
          <div className="flex gap-2">
            <Input
              id="newKeyName"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Site renovation-metbach.fr"
              disabled={creating}
            />
            <Button type="button" onClick={handleCreate} disabled={creating || !newKeyName.trim()} className="bg-violet-600 hover:bg-violet-700">
              <Plus className="mr-1 h-4 w-4" /> Créer
            </Button>
          </div>
        </div>

        {/* Existing keys */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-700">Clés existantes ({keys.filter(k => !k.revoked_at).length} active{keys.filter(k => !k.revoked_at).length > 1 ? 's' : ''})</div>
          {loading && <div className="text-xs text-slate-500">Chargement…</div>}
          {!loading && keys.length === 0 && (
            <div className="rounded-md border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
              Aucune clé créée pour ce client.
            </div>
          )}
          {keys.map((k) => (
            <div
              key={k.id}
              className={`flex items-center justify-between rounded-md border p-3 text-xs ${
                k.revoked_at ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900">
                  {k.name}
                  {k.revoked_at && <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">Révoquée</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                  <span className="font-mono">{k.key_prefix}…</span>
                  <span>Créée le {formatDate(k.created_at)}</span>
                  <span>Dernier usage : {formatDate(k.last_used_at)}</span>
                  <span>{k.use_count} appel{k.use_count > 1 ? 's' : ''}</span>
                </div>
              </div>
              {!k.revoked_at && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-rose-300 text-rose-700 hover:bg-rose-50"
                  onClick={() => handleRevoke(k.id, k.name)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <a
            href="https://supabase.com/docs/guides/functions"
            target="_blank"
            rel="noreferrer"
            className="mr-auto inline-flex items-center gap-1 text-xs text-violet-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Doc Edge Function
          </a>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
