import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAllReminders, useCompleteReminder } from '@/features/prospection/hooks/use-reminders'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import {
  Bell, AlertTriangle, Clock, Check, Phone,
  Printer, Calendar, Hourglass, Search, Flame, ChevronRight,
} from 'lucide-react'
import { useNoShowRdvsToRecall, useForgottenProspects } from '../hooks/use-recall-pool'
import {
  REMINDER_CONTEXT_LABELS,
  REMINDER_CONTEXT_COLORS,
  REMINDER_CONTEXT_BORDER,
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_STATUS_COLORS,
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUS_COLORS,
  type ReminderContext,
  type OpportunityStatus,
  type ProspectStatus,
} from '@/types/enums'
import type { Reminder } from '@/types'

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════

function isOverdue(r: Reminder) {
  return !r.is_completed && new Date(r.remind_at) < new Date()
}
function isToday(r: Reminder) {
  const d = new Date(r.remind_at)
  const now = new Date()
  return !r.is_completed && d.toDateString() === now.toDateString()
}

const CONTEXT_ORDER: ReminderContext[] = ['post_rdv', 'post_site', 'cold_call', 'post_perte', 'manuel']

/** Format phone for tel: link (strip spaces but keep +). */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

/** Format display phone with French spacing. */
function formatPhoneFR(phone: string): string {
  const clean = phone.replace(/\D/g, '')
  if (clean.length === 10 && clean.startsWith('0')) {
    return clean.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
  }
  return phone
}

// ════════════════════════════════════════════════════════════════════
// Composant unifié : ligne compacte avec téléphone cliquable + actions
// ════════════════════════════════════════════════════════════════════

interface RecallRowProps {
  title: string
  company: string
  contactName?: string | null
  city?: string | null
  phone: string
  badgeLabel?: string
  badgeClass?: string
  meta?: string | null  // ex "Dernier appel : 12/03"
  note?: string | null
  prospectId: string
  borderClass?: string
  bgClass?: string
  textClass?: string
  onComplete?: () => void
  onCompletePending?: boolean
}

function RecallRow({
  title, company, contactName, city, phone,
  badgeLabel, badgeClass, meta, note,
  prospectId, borderClass = 'border-l-gray-300',
  bgClass = 'bg-background', textClass = 'text-foreground',
  onComplete, onCompletePending,
}: RecallRowProps) {
  const navigate = useNavigate()
  return (
    <div className={cn(
      'flex items-start gap-2.5 rounded-lg border border-l-4 p-2.5',
      borderClass, bgClass,
    )}>
      <div className="flex-1 min-w-0 space-y-1">
        {/* Top row : date + badge + meta */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-xs font-semibold', textClass)}>{title}</span>
          {badgeLabel && (
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', badgeClass)}>
              {badgeLabel}
            </span>
          )}
          {meta && <span className="text-[10px] text-muted-foreground">{meta}</span>}
        </div>
        {/* Société + contact + tel */}
        <div className="flex items-baseline gap-2 flex-wrap min-w-0">
          <button
            onClick={() => navigate(`/prospects/${prospectId}`)}
            className="text-sm font-semibold text-foreground hover:text-primary transition-colors truncate text-left"
            title="Ouvrir la fiche prospect"
          >
            {company}
          </button>
          {contactName && (
            <span className="text-xs text-muted-foreground truncate">{contactName}</span>
          )}
          {city && (
            <span className="text-[11px] text-muted-foreground">{city}</span>
          )}
        </div>
        {/* Note */}
        {note && <p className="text-xs text-muted-foreground line-clamp-2">{note}</p>}
      </div>

      {/* Actions à droite */}
      <div className="flex items-center gap-1 shrink-0 print:hidden">
        <a
          href={telHref(phone)}
          className="flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
          title={`Appeler ${formatPhoneFR(phone)}`}
        >
          <Phone className="h-3.5 w-3.5" /> {formatPhoneFR(phone)}
        </a>
        {onComplete && (
          <Button
            variant="ghost" size="sm"
            className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
            onClick={onComplete}
            disabled={onCompletePending}
            title="Marquer comme fait"
          >
            <Check className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost" size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(`/prospects/${prospectId}`)}
          title="Ouvrir la fiche"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Print-only phone (visible quand on imprime, sinon il est dans le bouton) */}
      <div className="hidden print:block ml-2 text-xs font-mono">{formatPhoneFR(phone)}</div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Reminder card spécifique (a un contexte de pipeline en plus)
// ════════════════════════════════════════════════════════════════════

interface ReminderRowProps {
  reminder: Reminder
  onComplete: (id: string, prospectId: string) => void
  isPending: boolean
}

function ReminderRow({ reminder, onComplete, isPending }: ReminderRowProps) {
  const ctx = (reminder.context ?? 'manuel') as ReminderContext
  const overdue = isOverdue(reminder)
  const today = isToday(reminder)
  const border = REMINDER_CONTEXT_BORDER[ctx] ?? 'border-l-gray-300'
  const prospect = reminder.prospect as {
    id: string; company_name: string; phone?: string;
    status?: string;
    contact_firstname?: string | null; contact_name?: string | null;
    opportunities?: { id: string; status: string; deleted_at: string | null }[]
  } | undefined
  if (!prospect) return null
  const activeOpp = prospect.opportunities?.find(o => !o.deleted_at)
  const fullName = [prospect.contact_firstname, prospect.contact_name].filter(Boolean).join(' ')

  const badge = activeOpp
    ? { label: OPPORTUNITY_STATUS_LABELS[activeOpp.status as OpportunityStatus] ?? activeOpp.status,
        cls: OPPORTUNITY_STATUS_COLORS[activeOpp.status as OpportunityStatus] ?? 'bg-gray-100 text-gray-700' }
    : prospect.status
    ? { label: PROSPECT_STATUS_LABELS[prospect.status as ProspectStatus] ?? prospect.status,
        cls: PROSPECT_STATUS_COLORS[prospect.status as ProspectStatus] ?? 'bg-gray-100 text-gray-700' }
    : null

  const title = overdue
    ? `⚠ En retard · ${formatDate(reminder.remind_at)}`
    : today
    ? `🔥 Aujourd'hui · ${formatDate(reminder.remind_at)}`
    : formatDate(reminder.remind_at)

  return (
    <RecallRow
      title={title}
      company={prospect.company_name}
      contactName={fullName || null}
      phone={prospect.phone ?? ''}
      badgeLabel={badge?.label}
      badgeClass={badge?.cls}
      meta={REMINDER_CONTEXT_LABELS[ctx]}
      note={reminder.note}
      prospectId={prospect.id}
      borderClass={overdue ? 'border-l-red-400' : today ? 'border-l-orange-400' : border}
      bgClass={overdue ? 'bg-red-50' : today ? 'bg-orange-50' : undefined}
      textClass={overdue ? 'text-red-700' : today ? 'text-orange-700' : undefined}
      onComplete={() => onComplete(reminder.id, reminder.prospect_id)}
      onCompletePending={isPending}
    />
  )
}

// ════════════════════════════════════════════════════════════════════
// KPI Pill (petit chiffre + label coloré)
// ════════════════════════════════════════════════════════════════════

function KpiPill({ icon, label, value, tone }: {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'red' | 'amber' | 'purple' | 'gray'
}) {
  const cls = {
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
  }[tone]
  return (
    <div className={cn('flex items-center gap-2 rounded-md border px-3 py-1.5', cls)}>
      {icon}
      <span className="text-lg font-bold tabular-nums">{value}</span>
      <span className="text-xs">{label}</span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Page
// ════════════════════════════════════════════════════════════════════

export function RemindersPage() {
  const { isFounder } = useAuth()
  const { data: reminders, isLoading } = useAllReminders()
  const { data: noShowRdvs } = useNoShowRdvsToRecall()
  const { data: forgottenProspects } = useForgottenProspects(100)
  const completeReminder = useCompleteReminder()

  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'urgent' | 'rdv' | 'forgotten'>('urgent')

  async function handleComplete(id: string, prospectId: string) {
    try {
      await completeReminder.mutateAsync({ id, prospectId })
      toast.success('Rappel marqué comme fait')
    } catch {
      toast.error('Erreur')
    }
  }

  // Buckets reminders
  const { overdue, today, upcoming, urgentCount } = useMemo(() => {
    const all = reminders ?? []
    const ov = all.filter(isOverdue).sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime())
    const td = all.filter(isToday).sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime())
    const up = all.filter(r => !r.is_completed && !isOverdue(r) && !isToday(r))
      .sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime())
    return { overdue: ov, today: td, upcoming: up, urgentCount: ov.length + td.length + up.length }
  }, [reminders])

  // Filtre par search (sur company_name)
  const searchLower = search.trim().toLowerCase()
  function matchSearch(text?: string | null): boolean {
    if (!searchLower) return true
    return (text ?? '').toLowerCase().includes(searchLower)
  }

  const filteredOverdue = overdue.filter(r => matchSearch(
    (r.prospect as { company_name?: string } | undefined)?.company_name
  ))
  const filteredToday = today.filter(r => matchSearch(
    (r.prospect as { company_name?: string } | undefined)?.company_name
  ))
  const filteredUpcoming = upcoming.filter(r => matchSearch(
    (r.prospect as { company_name?: string } | undefined)?.company_name
  ))
  const filteredRdvs = (noShowRdvs ?? []).filter(r =>
    matchSearch(r.prospect?.company_name)
  )
  const filteredForgotten = (forgottenProspects ?? []).filter(p =>
    matchSearch(p.company_name)
  )

  // Groupage des "upcoming" par contexte (pour Tab Urgent, sous-section)
  const upcomingByContext = useMemo(() => {
    const map: Record<string, Reminder[]> = {}
    for (const r of filteredUpcoming) {
      const key = r.context ?? 'manuel'
      if (!map[key]) map[key] = []
      map[key].push(r)
    }
    return map
  }, [filteredUpcoming])

  const noShowCount = noShowRdvs?.length ?? 0
  const forgottenCount = forgottenProspects?.length ?? 0
  const totalAll = urgentCount + noShowCount + forgottenCount

  return (
    <div className="h-full flex flex-col">

      {/* ───── Header : titre + KPI + search + imprimer ───── */}
      <div className="border-b bg-background print:hidden">
        <div className="flex items-center gap-3 px-6 pt-4">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Rappels</h1>
          {totalAll > 0 && (
            <Badge className="bg-red-500 text-white text-xs">{totalAll}</Badge>
          )}
          {isFounder && (
            <Badge variant="outline" className="text-xs">Équipe complète</Badge>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1.5" /> Imprimer
            </Button>
          </div>
        </div>

        {/* KPI pills */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-3">
          <KpiPill icon={<Flame className="h-4 w-4" />} label="urgents" value={urgentCount} tone={urgentCount > 0 ? 'red' : 'gray'} />
          <KpiPill icon={<Calendar className="h-4 w-4" />} label="RDV à rattraper" value={noShowCount} tone={noShowCount > 0 ? 'amber' : 'gray'} />
          <KpiPill icon={<Hourglass className="h-4 w-4" />} label="opportunités oubliées" value={forgottenCount} tone={forgottenCount > 0 ? 'purple' : 'gray'} />
        </div>

        {/* Search */}
        <div className="relative px-6 pb-3">
          <Search className="absolute left-9 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom de société…"
            className="pl-9 max-w-md"
          />
        </div>
      </div>

      {/* Header impression simplifié */}
      <div className="hidden print:block px-6 py-3 border-b">
        <h1 className="text-lg font-bold">Liste des rappels à passer</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Édité le {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
          {' · '}{totalAll} contact{totalAll > 1 ? 's' : ''} à rappeler
        </p>
      </div>

      {/* ───── Contenu ───── */}
      {isLoading ? (
        <div className="flex-1 p-6 space-y-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : totalAll === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-3">
          <Check className="h-10 w-10 text-green-500" />
          <p className="text-lg font-medium text-muted-foreground">Aucun rappel en attente</p>
          <p className="text-sm text-muted-foreground/60">Tout est à jour, GG.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto print:overflow-visible">

          {/* Tabs visibles à l'écran uniquement (cachés à l'impression) */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full print:hidden">
            <div className="sticky top-0 z-10 bg-background border-b print:hidden">
              <TabsList className="ml-6 my-2">
                <TabsTrigger value="urgent" className="text-xs">
                  <Flame className="h-3.5 w-3.5 mr-1.5" />
                  Urgent
                  <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px]">{urgentCount}</Badge>
                </TabsTrigger>
                <TabsTrigger value="rdv" className="text-xs">
                  <Calendar className="h-3.5 w-3.5 mr-1.5" />
                  RDV à rattraper
                  <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px]">{noShowCount}</Badge>
                </TabsTrigger>
                <TabsTrigger value="forgotten" className="text-xs">
                  <Hourglass className="h-3.5 w-3.5 mr-1.5" />
                  Opportunités oubliées
                  <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px]">{forgottenCount}</Badge>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ─────── Tab URGENT ─────── */}
            <TabsContent value="urgent" className="m-0 p-6 max-w-4xl space-y-6 print:max-w-none print:p-0">
              {filteredOverdue.length === 0 && filteredToday.length === 0 && filteredUpcoming.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {searchLower ? 'Aucun résultat pour cette recherche.' : 'Rien d\'urgent.'}
                </p>
              )}

              {filteredOverdue.length > 0 && (
                <section>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-red-700 mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    En retard
                    <Badge variant="secondary" className="ml-auto text-xs">{filteredOverdue.length}</Badge>
                  </h2>
                  <div className="space-y-2">
                    {filteredOverdue.map(r => (
                      <ReminderRow key={r.id} reminder={r} onComplete={handleComplete} isPending={completeReminder.isPending} />
                    ))}
                  </div>
                </section>
              )}

              {filteredToday.length > 0 && (
                <section>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-orange-700 mb-2">
                    <Clock className="h-4 w-4" />
                    Aujourd'hui
                    <Badge variant="secondary" className="ml-auto text-xs">{filteredToday.length}</Badge>
                  </h2>
                  <div className="space-y-2">
                    {filteredToday.map(r => (
                      <ReminderRow key={r.id} reminder={r} onComplete={handleComplete} isPending={completeReminder.isPending} />
                    ))}
                  </div>
                </section>
              )}

              {filteredUpcoming.length > 0 && (
                <section className="space-y-4">
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    À venir · {filteredUpcoming.length}
                  </h2>
                  {CONTEXT_ORDER.map(ctx => {
                    const group = upcomingByContext[ctx] ?? []
                    if (group.length === 0) return null
                    return (
                      <div key={ctx}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={cn(
                            'text-[10px] font-bold px-1.5 py-0.5 rounded border',
                            REMINDER_CONTEXT_COLORS[ctx],
                          )}>
                            {REMINDER_CONTEXT_LABELS[ctx]}
                          </span>
                          <span className="text-xs text-muted-foreground">{group.length}</span>
                        </div>
                        <div className="space-y-2">
                          {group.map(r => (
                            <ReminderRow key={r.id} reminder={r} onComplete={handleComplete} isPending={completeReminder.isPending} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </section>
              )}
            </TabsContent>

            {/* ─────── Tab RDV à rattraper ─────── */}
            <TabsContent value="rdv" className="m-0 p-6 max-w-4xl space-y-2 print:max-w-none print:p-0">
              {filteredRdvs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {searchLower ? 'Aucun résultat.' : 'Aucun RDV en attente de rappel.'}
                </p>
              ) : (
                filteredRdvs.map(rdv => {
                  const p = rdv.prospect
                  if (!p) return null
                  const fullName = [p.contact_firstname, p.contact_name].filter(Boolean).join(' ')
                  return (
                    <RecallRow
                      key={rdv.id}
                      title={`RDV ${formatDate(rdv.scheduled_at)}`}
                      company={p.company_name}
                      contactName={fullName || null}
                      phone={p.phone}
                      badgeLabel={rdv.recall_status === 'in_progress' ? 'Relance en cours' : 'À relancer'}
                      badgeClass="bg-amber-100 text-amber-700"
                      meta={rdv.recall_attempts > 0 ? `${rdv.recall_attempts} tentative${rdv.recall_attempts > 1 ? 's' : ''}` : null}
                      note={rdv.no_show_reason || rdv.notes}
                      prospectId={p.id}
                      borderClass="border-l-amber-400"
                    />
                  )
                })
              )}
            </TabsContent>

            {/* ─────── Tab Opportunités oubliées ─────── */}
            <TabsContent value="forgotten" className="m-0 p-6 max-w-4xl space-y-2 print:max-w-none print:p-0">
              <p className="text-[11px] text-muted-foreground mb-3">
                Prospects avec un rappel prévu dans le passé sans action depuis. Souvent des « rappelez-moi plus tard » oubliés — possibilité de ré-ouvrir l'opportunité.
              </p>
              {filteredForgotten.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {searchLower ? 'Aucun résultat.' : 'Aucun prospect oublié.'}
                </p>
              ) : (
                filteredForgotten.map(p => {
                  const fullName = [p.contact_firstname, p.contact_name].filter(Boolean).join(' ')
                  return (
                    <RecallRow
                      key={p.id}
                      title={`Prévu ${formatDate(p.next_reminder_at)}`}
                      company={p.company_name}
                      contactName={fullName || null}
                      city={p.city}
                      phone={p.phone}
                      badgeLabel={p.profession ?? undefined}
                      badgeClass="bg-purple-100 text-purple-700"
                      meta={p.last_called_at ? `Dernier appel : ${formatDate(p.last_called_at)}` : null}
                      note={p.notes}
                      prospectId={p.id}
                      borderClass="border-l-purple-400"
                    />
                  )
                })
              )}
            </TabsContent>
          </Tabs>

          {/* ─── Version IMPRESSION : toutes les sections enchaînées sans tabs ─── */}
          <div className="hidden print:block px-6 space-y-8 pt-4">
            {filteredOverdue.length + filteredToday.length + filteredUpcoming.length > 0 && (
              <section>
                <h2 className="text-base font-bold mb-2 border-b pb-1">Urgents</h2>
                <div className="space-y-1.5">
                  {[...filteredOverdue, ...filteredToday, ...filteredUpcoming].map(r => (
                    <ReminderRow key={r.id} reminder={r} onComplete={handleComplete} isPending={false} />
                  ))}
                </div>
              </section>
            )}
            {filteredRdvs.length > 0 && (
              <section>
                <h2 className="text-base font-bold mb-2 border-b pb-1">RDV à rattraper</h2>
                <div className="space-y-1.5">
                  {filteredRdvs.map(rdv => {
                    const p = rdv.prospect
                    if (!p) return null
                    return (
                      <RecallRow
                        key={rdv.id}
                        title={`RDV ${formatDate(rdv.scheduled_at)}`}
                        company={p.company_name}
                        contactName={[p.contact_firstname, p.contact_name].filter(Boolean).join(' ') || null}
                        phone={p.phone}
                        note={rdv.no_show_reason || rdv.notes}
                        prospectId={p.id}
                        borderClass="border-l-amber-400"
                      />
                    )
                  })}
                </div>
              </section>
            )}
            {filteredForgotten.length > 0 && (
              <section>
                <h2 className="text-base font-bold mb-2 border-b pb-1">Opportunités à ré-ouvrir</h2>
                <div className="space-y-1.5">
                  {filteredForgotten.map(p => (
                    <RecallRow
                      key={p.id}
                      title={`Prévu ${formatDate(p.next_reminder_at)}`}
                      company={p.company_name}
                      contactName={[p.contact_firstname, p.contact_name].filter(Boolean).join(' ') || null}
                      city={p.city}
                      phone={p.phone}
                      meta={p.last_called_at ? `Dernier : ${formatDate(p.last_called_at)}` : null}
                      note={p.notes}
                      prospectId={p.id}
                      borderClass="border-l-purple-400"
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
