import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Phone, Check, ExternalLink, MessageCircle, Mail, Inbox } from 'lucide-react'
import { useSmartleadInbox, useMarkReplyHandled, useRequestNotificationPermission } from '../hooks/use-smartlead-inbox'
import { describeError } from '@/features/portal/lib/error-utils'
import { toast } from 'sonner'
import { formatPhone } from '@/lib/format'

export function SmartleadInboxPage() {
  const navigate = useNavigate()
  const { data: prospects, isLoading } = useSmartleadInbox()
  const markHandled = useMarkReplyHandled()
  useRequestNotificationPermission()

  const handleMarkHandled = async (id: string, name: string) => {
    try {
      await markHandled.mutateAsync(id)
      toast.success(`${name} marqué comme traité`)
    } catch (e) {
      toast.error(describeError(e))
    }
  }

  const total = prospects?.length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-100 text-purple-700">
            <Inbox className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Inbox Smartlead</h1>
            <p className="text-sm text-muted-foreground">
              Prospects ayant répondu à un cold email — triés du plus récent au plus ancien.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-base px-3 py-1">
          <MessageCircle className="h-4 w-4 mr-1.5" />
          {total} à traiter
        </Badge>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      )}

      {!isLoading && total === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Mail className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-lg font-medium">Aucune réponse en attente</p>
            <p className="text-sm mt-1">Quand un prospect répondra à une campagne Smartlead, il apparaîtra ici en temps réel.</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && prospects && prospects.map((p) => {
        const cf = p.custom_fields ?? {}
        const replyCount = typeof cf.smartlead_reply_count === 'number' ? cf.smartlead_reply_count : 0
        const sentAt = typeof cf.smartlead_last_sent_at === 'string' ? new Date(cf.smartlead_last_sent_at) : null
        const compRaw = cf.competitors_count_lsa
        const comp = typeof compRaw === 'number' ? compRaw : (typeof compRaw === 'string' && compRaw ? parseInt(compRaw, 10) : null)
        const name = [p.contact_firstname, p.contact_name].filter(Boolean).join(' ')

        return (
          <Card key={p.id} className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => navigate(`/prospects/${p.id}`)}
                      className="text-lg font-bold hover:underline text-left"
                    >
                      {p.company_name}
                    </button>
                    <Badge className="bg-purple-100 text-purple-800 border border-purple-300">
                      💬 {replyCount > 1 ? `${replyCount} réponses` : 'A RÉPONDU'}
                    </Badge>
                    {comp != null && (
                      <Badge variant="outline" className={
                        comp === 0 ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                        comp === 1 ? 'bg-green-50 text-green-800' :
                        comp === 2 ? 'bg-amber-50 text-amber-800' :
                        'bg-red-50 text-red-800'
                      }>
                        ⚔ {comp} LSA
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {name && <>{name} · </>}
                    {p.profession && <>{p.profession} · </>}
                    {p.city}
                  </p>
                  {sentAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Cold email envoyé le {sentAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <a href={`tel:${p.phone}`}>
                      <Phone className="h-4 w-4 mr-1.5" />
                      {formatPhone(p.phone)}
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleMarkHandled(p.id, p.company_name)}
                    disabled={markHandled.isPending}
                  >
                    <Check className="h-4 w-4 mr-1.5" />
                    Marquer traité
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/prospects/${p.id}`)}>
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Fiche
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
