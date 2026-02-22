import { useState } from 'react'
import { useTeamMembers } from '../hooks/use-prospects'
import { useAssignProspects, useAssignProspectsSplit } from '../hooks/use-prospects'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Users, UserPlus, Percent } from 'lucide-react'

interface AssignModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedIds: string[]
  onDone: () => void
}

export function AssignModal({ open, onOpenChange, selectedIds, onDone }: AssignModalProps) {
  const { data: members = [] } = useTeamMembers()
  const assignSingle = useAssignProspects()
  const assignSplit = useAssignProspectsSplit()

  const [mode, setMode] = useState<'single' | 'split'>('single')
  const [selectedMember, setSelectedMember] = useState('')
  const [splits, setSplits] = useState<{ commercial_id: string; percentage: number }[]>([])

  function addSplit() {
    if (members.length === 0) return
    const used = splits.map((s) => s.commercial_id)
    const available = members.find((m) => !used.includes(m.id))
    if (!available) return
    const remaining = 100 - splits.reduce((sum, s) => sum + s.percentage, 0)
    setSplits([...splits, { commercial_id: available.id, percentage: Math.max(remaining, 0) }])
  }

  function removeSplit(index: number) {
    setSplits(splits.filter((_, i) => i !== index))
  }

  function updateSplit(index: number, field: 'commercial_id' | 'percentage', value: string | number) {
    setSplits(splits.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  const totalPercent = splits.reduce((sum, s) => sum + s.percentage, 0)

  async function handleAssign() {
    if (mode === 'single') {
      if (!selectedMember) return
      await assignSingle.mutateAsync({ ids: selectedIds, commercialId: selectedMember })
    } else {
      if (splits.length === 0 || totalPercent !== 100) return
      await assignSplit.mutateAsync({ ids: selectedIds, assignments: splits })
    }
    onDone()
    onOpenChange(false)
  }

  const isPending = assignSingle.isPending || assignSplit.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Attribuer {selectedIds.length} prospect{selectedIds.length > 1 ? 's' : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button
              variant={mode === 'single' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('single')}
              className="flex-1"
            >
              <UserPlus className="h-4 w-4 mr-1" />
              Un seul membre
            </Button>
            <Button
              variant={mode === 'split' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setMode('split'); if (splits.length === 0) addSplit() }}
              className="flex-1"
            >
              <Percent className="h-4 w-4 mr-1" />
              Répartir en %
            </Button>
          </div>

          {mode === 'single' && (
            <div className="space-y-2">
              <Label>Attribuer à</Label>
              <Select value={selectedMember} onValueChange={setSelectedMember}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un membre..." />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name} ({m.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === 'split' && (
            <div className="space-y-3">
              <Label>Répartition</Label>
              {splits.map((split, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                  <Select
                    value={split.commercial_id}
                    onValueChange={(v) => updateSplit(i, 'commercial_id', v)}
                  >
                    <SelectTrigger className="flex-1 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1 w-24">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={split.percentage}
                      onChange={(e) => updateSplit(i, 'percentage', parseInt(e.target.value) || 0)}
                      className="h-8 w-16 text-center"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    ~{Math.round((split.percentage / 100) * selectedIds.length)} p.
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-500"
                    onClick={() => removeSplit(i)}
                  >
                    ×
                  </Button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={addSplit} disabled={splits.length >= members.length}>
                  + Ajouter
                </Button>
                <span className={`text-sm font-medium ${totalPercent === 100 ? 'text-green-600' : 'text-red-600'}`}>
                  Total : {totalPercent}%
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button
            onClick={handleAssign}
            disabled={
              isPending ||
              (mode === 'single' && !selectedMember) ||
              (mode === 'split' && (splits.length === 0 || totalPercent !== 100))
            }
          >
            {isPending ? 'Attribution...' : 'Attribuer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
