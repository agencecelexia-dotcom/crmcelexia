import { useRef, useState } from 'react'
import { FileText, Upload, Trash2, Download } from 'lucide-react'
import { toast } from 'sonner'
import {
  useLeadInvoices,
  useUploadLeadInvoice,
  useDeleteLeadInvoice,
} from '../hooks/use-lead-invoices'
import { getLeadInvoiceUrl } from '../services/portal-lead-invoice-service'

const INVOICE_TYPE_LABELS: Record<'acompte' | 'solde' | 'finale', string> = {
  acompte: 'Acompte',
  solde: 'Solde',
  finale: 'Finale',
}

const INVOICE_TYPE_COLORS: Record<'acompte' | 'solde' | 'finale', { bg: string; color: string }> = {
  acompte: { bg: '#FEF3C7', color: '#92400E' },
  solde: { bg: '#DBEAFE', color: '#1E40AF' },
  finale: { bg: '#DCFCE7', color: '#166534' },
}

/**
 * Section "Factures du chantier" : visible sur la fiche d'un lead signé.
 * Permet à l'artisan de tracker les factures qu'il a émises à son client
 * final (acompte, solde, finale).
 */
export function LeadInvoicesSection({ leadId, clientId }: { leadId: string; clientId: string }) {
  const { data: invoices } = useLeadInvoices(leadId)
  const upload = useUploadLeadInvoice()
  const remove = useDeleteLeadInvoice(leadId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [type, setType] = useState<'acompte' | 'solde' | 'finale'>('acompte')
  const [amount, setAmount] = useState('')

  function pickFile(f: File) {
    if (f.size > 10 * 1024 * 1024) {
      toast.error('Fichier trop lourd (max 10 Mo)')
      return
    }
    if (!/\.(pdf|png|jpe?g)$/i.test(f.name)) {
      toast.error('Format non supporté (PDF, JPG, PNG)')
      return
    }
    setPendingFile(f)
  }

  async function handleConfirm() {
    if (!pendingFile) return
    await upload.mutateAsync({
      leadId,
      clientId,
      file: pendingFile,
      invoiceType: type,
      amountTtc: amount ? Number(amount) : null,
    })
    setPendingFile(null)
    setAmount('')
    setType('acompte')
  }

  async function handleDownload(path: string) {
    const url = await getLeadInvoiceUrl(path)
    if (!url) { toast.error('Lien indisponible'); return }
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="p-card" style={{ padding: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-900)', marginBottom: 14 }}>
        Factures du chantier
      </h3>

      {/* Drop zone ou form de confirmation */}
      {pendingFile ? (
        <div className="rounded-md border border-violet-200 bg-violet-50 p-3">
          <div className="mb-3 flex items-center gap-2">
            <FileText size={18} className="text-violet-700" />
            <span className="flex-1 truncate text-sm font-medium">{pendingFile.name}</span>
            <button
              type="button"
              className="text-xs text-gray-500 hover:underline"
              onClick={() => setPendingFile(null)}
            >
              Annuler
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-xs">
              <span className="mb-1 block font-medium text-gray-700">Type de facture</span>
              <select
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as 'acompte' | 'solde' | 'finale')}
                style={{ fontSize: 16 }}
              >
                <option value="acompte">Acompte</option>
                <option value="solde">Solde</option>
                <option value="finale">Finale</option>
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-gray-700">Montant TTC (optionnel)</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="1500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
                style={{ fontSize: 16 }}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={upload.isPending}
            className="btn btn-primary mt-3 w-full"
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            {upload.isPending ? 'Envoi…' : 'Ajouter cette facture'}
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false)
            const f = e.dataTransfer.files[0]; if (f) pickFile(f)
          }}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-md border-2 border-dashed p-4 text-center transition-colors ${
            dragOver
              ? 'border-violet-400 bg-violet-50'
              : 'border-gray-300 bg-gray-50 hover:border-violet-300 hover:bg-violet-50/30'
          }`}
        >
          <Upload size={20} className="mx-auto text-violet-600" />
          <div className="mt-1 text-sm font-medium text-gray-900">Déposer une facture</div>
          <div className="text-xs text-gray-500">PDF / JPG / PNG · max 10 Mo</div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) pickFile(f)
              e.target.value = ''
            }}
          />
        </div>
      )}

      {/* Liste des factures */}
      {invoices && invoices.length > 0 && (
        <ul className="mt-4 space-y-2">
          {invoices.map((inv) => {
            const col = INVOICE_TYPE_COLORS[inv.invoice_type]
            return (
              <li
                key={inv.id}
                className="flex items-center gap-3 rounded-md border border-gray-200 bg-white p-2.5"
              >
                <FileText size={18} className="shrink-0 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">{inv.file_name}</span>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                      style={{ background: col.bg, color: col.color }}
                    >
                      {INVOICE_TYPE_LABELS[inv.invoice_type]}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {new Date(inv.created_at).toLocaleDateString('fr-FR')}
                    {inv.amount_ttc != null && ` · ${Number(inv.amount_ttc).toLocaleString('fr-FR')} € TTC`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownload(inv.file_path)}
                  className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-violet-700"
                  title="Télécharger"
                >
                  <Download size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Supprimer "${inv.file_name}" ?`)) remove.mutate(inv.id)
                  }}
                  className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  title="Supprimer"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
