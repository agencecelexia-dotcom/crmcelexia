import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Upload } from 'lucide-react'
import { usePortalAuth } from '../hooks/use-portal-auth'
import { useQuotesList } from '../hooks/use-quotes'
import { QUOTE_STATUS_COLORS, QUOTE_STATUS_LABELS } from '@/types/enums'
import type { QuoteStatus } from '@/types'
import { formatDateShort } from '@/lib/format'
import { UploadExternalQuoteDialog } from '../components/upload-external-quote-dialog'
import { useQueryClient } from '@tanstack/react-query'

const FILTERS: Array<{ key: 'all' | QuoteStatus; label: string }> = [
  { key: 'all', label: 'Tous' },
  { key: 'draft', label: 'Brouillon' },
  { key: 'sent', label: 'Envoyé' },
  { key: 'signed', label: 'Signé' },
  { key: 'refused', label: 'Refusé' },
  { key: 'expired', label: 'Expiré' },
]

export function PortalQuotesListPage() {
  const { client } = usePortalAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<'all' | QuoteStatus>('all')
  const [uploadOpen, setUploadOpen] = useState(false)
  const { data: quotes, isLoading } = useQuotesList(
    client?.id,
    filter === 'all' ? undefined : filter,
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 sm:mb-6">
        <div>
          <h1 className="font-display text-xl font-bold leading-tight sm:text-2xl md:text-[26px]">Devis</h1>
          <p className="mt-0.5 text-xs text-[var(--gray-500)] sm:text-sm">Vos devis envoyés et brouillons</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            onClick={() => setUploadOpen(true)}
            style={{ minHeight: 40, background: '#fff', border: '1px solid var(--gray-200)' }}
          >
            <Upload size={16} /> <span className="hidden sm:inline">Importer un PDF</span><span className="sm:hidden">PDF</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/portal/devis/nouveau')}
            style={{ minHeight: 40 }}
          >
            <Plus size={16} /> <span className="hidden sm:inline">Nouveau devis</span><span className="sm:hidden">Nouveau</span>
          </button>
        </div>
      </div>

      <UploadExternalQuoteDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['quotes', client?.id] })
        }}
      />


      {/* Filters */}
      <div className="mb-4 -mx-1 flex flex-nowrap gap-1.5 overflow-x-auto pb-1 sm:mb-5 sm:flex-wrap sm:overflow-visible">
        {FILTERS.map((f) => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? 'bg-[var(--violet-600)] text-white'
                  : 'bg-white text-[var(--gray-700)] hover:bg-[var(--gray-100)] border border-[var(--gray-200)]'
              }`}
              style={{ minHeight: 32 }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Chargement…</div>
      ) : !quotes || quotes.length === 0 ? (
        <EmptyState onCreate={() => navigate('/portal/devis/nouveau')} />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:gap-3">
          {quotes.map((q) => {
            const cols = QUOTE_STATUS_COLORS[q.status]
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => navigate(`/portal/devis/${q.id}`)}
                className="p-card p-card-hoverable cursor-pointer text-left"
                style={{ padding: '14px 16px', display: 'block', width: '100%' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-[var(--gray-500)]">{q.quote_number}</span>
                      <span
                        className="p-tag"
                        style={{ background: cols.bg, color: cols.color, border: 'none' }}
                      >
                        {QUOTE_STATUS_LABELS[q.status]}
                      </span>
                    </div>
                    <div className="truncate text-sm font-semibold text-[var(--gray-900)] sm:text-[15px]">
                      {q.recipient_name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--gray-500)] sm:text-xs">
                      Émis le {formatDateShort(q.issued_at)} · Valide jusqu'au {formatDateShort(q.valid_until)}
                    </div>
                    <div className="mt-0.5 text-[11px] sm:text-xs">
                      {q.portal_lead ? (
                        <span className="text-[var(--gray-500)]">
                          Lead :{' '}
                          <span
                            role="link"
                            tabIndex={-1}
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/portal/leads/${q.portal_lead!.id}`)
                            }}
                            className="cursor-pointer text-violet-700 underline"
                          >
                            {q.portal_lead.name}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          Non attribué
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-display text-base font-bold text-[var(--gray-900)] sm:text-lg">
                      {Number(q.total_ttc).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </div>
                    <div className="text-[10px] text-[var(--gray-500)] sm:text-[11px]">TTC</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="p-card flex flex-col items-center justify-center px-4 py-12 text-center">
      <div
        className="mb-3 flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: 'var(--violet-100)', color: 'var(--violet-600)' }}
      >
        <FileText size={24} />
      </div>
      <h3 className="mb-1 font-display text-base font-bold text-[var(--gray-900)]">Aucun devis</h3>
      <p className="mb-4 max-w-[320px] text-sm text-[var(--gray-500)]">
        Créez votre premier devis. Il sera personnalisé avec votre logo, vos mentions légales et votre RIB.
      </p>
      <button type="button" className="btn btn-primary" onClick={onCreate}>
        <Plus size={16} /> Nouveau devis
      </button>
    </div>
  )
}
