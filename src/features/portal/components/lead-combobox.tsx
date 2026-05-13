import { useState } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { usePortalLeads } from '../hooks/use-portal-leads'
import { CreateLeadDialog } from './create-lead-dialog'
import type { PortalLead } from '@/types'

interface LeadComboboxProps {
  value: string | null
  onChange: (leadId: string, lead: PortalLead) => void
  clientId: string
  /** Placeholder du bouton trigger. */
  placeholder?: string
}

/**
 * Combobox de sélection d'un lead pour un devis.
 * - Recherche fuzzy substring sur name + phone + email + city.
 * - Cache les leads "perdu" (les "signe" restent visibles : on peut faire
 *   un devis complémentaire pour un client déjà signé).
 * - Bouton "+ Nouveau lead" en bas qui ouvre un dialog de création inline.
 */
export function LeadCombobox({
  value,
  onChange,
  clientId,
  placeholder = 'Choisir un lead…',
}: LeadComboboxProps) {
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const { data: leads = [] } = usePortalLeads(clientId)

  const selectable = leads.filter((l) => l.status !== 'perdu')
  const current = selectable.find((l) => l.id === value)

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-11 w-full justify-between font-normal sm:h-10"
          >
            {current ? (
              <span className="truncate">
                <span className="font-medium">{current.name}</span>
                <span className="ml-2 text-muted-foreground">{current.phone}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Rechercher nom, tel, email…" />
            <CommandList>
              <CommandEmpty>Aucun lead trouvé.</CommandEmpty>
              <CommandGroup>
                {selectable.map((l) => (
                  <CommandItem
                    key={l.id}
                    value={`${l.name} ${l.phone} ${l.email ?? ''} ${l.city ?? ''}`}
                    onSelect={() => {
                      onChange(l.id, l)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={`mr-2 h-4 w-4 ${value === l.id ? 'opacity-100' : 'opacity-0'}`}
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{l.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {l.phone}
                        {l.city ? ` · ${l.city}` : ''}
                        {l.email ? ` · ${l.email}` : ''}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="border-t p-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setCreateOpen(true)
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <Plus size={14} className="text-violet-600" />
                <span className="font-medium">Nouveau lead</span>
              </button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>
      <CreateLeadDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        clientId={clientId}
        onCreated={(lead) => {
          onChange(lead.id, lead)
          setCreateOpen(false)
        }}
      />
    </>
  )
}
