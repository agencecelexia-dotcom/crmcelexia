import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Zap, DollarSign, Building2, TrendingUp, Clock, UserCheck } from 'lucide-react'
import type { LeadScore } from '@/types'

interface LeadScoringProps {
  initialScore?: Partial<LeadScore>
  onChange?: (score: LeadScore) => void
  readOnly?: boolean
}

function calculateScore(params: {
  budget_estimate: number | null
  company_size: string | null
  monthly_potential: number | null
  urgency_level: 'faible' | 'moyen' | 'eleve' | 'urgent'
  has_decision_maker: boolean
}): LeadScore {
  // Budget score (0-20)
  let budget_score = 0
  if (params.budget_estimate) {
    if (params.budget_estimate >= 50000) budget_score = 20
    else if (params.budget_estimate >= 20000) budget_score = 16
    else if (params.budget_estimate >= 10000) budget_score = 12
    else if (params.budget_estimate >= 5000) budget_score = 8
    else budget_score = 4
  }

  // Company size score (0-20)
  let company_size_score = 0
  switch (params.company_size) {
    case 'grande': company_size_score = 20; break
    case 'moyenne': company_size_score = 16; break
    case 'petite': company_size_score = 10; break
    case 'micro': company_size_score = 5; break
  }

  // Monthly potential (0-20)
  let monthly_potential_score = 0
  if (params.monthly_potential) {
    if (params.monthly_potential >= 5000) monthly_potential_score = 20
    else if (params.monthly_potential >= 2000) monthly_potential_score = 16
    else if (params.monthly_potential >= 1000) monthly_potential_score = 12
    else if (params.monthly_potential >= 500) monthly_potential_score = 8
    else monthly_potential_score = 4
  }

  // Urgency (0-20)
  const urgency_scores: Record<string, number> = { urgent: 20, eleve: 16, moyen: 10, faible: 4 }
  const urgency_score = urgency_scores[params.urgency_level] ?? 0

  // Decision maker (0-20)
  const decision_maker_score = params.has_decision_maker ? 20 : 5

  const total_score = budget_score + company_size_score + monthly_potential_score + urgency_score + decision_maker_score

  return {
    prospect_id: '',
    budget_score,
    company_size_score,
    monthly_potential_score,
    urgency_score,
    decision_maker_score,
    total_score,
    budget_estimate: params.budget_estimate,
    company_size: params.company_size,
    monthly_potential: params.monthly_potential,
    urgency_level: params.urgency_level,
    has_decision_maker: params.has_decision_maker,
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 bg-green-100'
  if (score >= 60) return 'text-blue-600 bg-blue-100'
  if (score >= 40) return 'text-yellow-600 bg-yellow-100'
  return 'text-red-600 bg-red-100'
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Chaud'
  if (score >= 60) return 'Tiede'
  if (score >= 40) return 'Moyen'
  return 'Froid'
}

export function LeadScoring({ initialScore, onChange, readOnly = false }: LeadScoringProps) {
  const [budgetEstimate, setBudgetEstimate] = useState(initialScore?.budget_estimate ?? null)
  const [companySize, setCompanySize] = useState(initialScore?.company_size ?? null)
  const [monthlyPotential, setMonthlyPotential] = useState(initialScore?.monthly_potential ?? null)
  const [urgencyLevel, setUrgencyLevel] = useState<'faible' | 'moyen' | 'eleve' | 'urgent'>(
    initialScore?.urgency_level ?? 'moyen'
  )
  const [hasDecisionMaker, setHasDecisionMaker] = useState(initialScore?.has_decision_maker ?? false)

  const score = calculateScore({
    budget_estimate: budgetEstimate,
    company_size: companySize,
    monthly_potential: monthlyPotential,
    urgency_level: urgencyLevel,
    has_decision_maker: hasDecisionMaker,
  })

  const handleChange = () => {
    if (onChange) {
      onChange(score)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Scoring du lead
          </CardTitle>
          <Badge className={`text-lg px-3 py-1 ${getScoreColor(score.total_score)}`}>
            {score.total_score}/100 - {getScoreLabel(score.total_score)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Score bars */}
        <div className="space-y-3 mb-6">
          <ScoreBar label="Budget" icon={<DollarSign className="h-3.5 w-3.5" />} score={score.budget_score} max={20} />
          <ScoreBar label="Taille entreprise" icon={<Building2 className="h-3.5 w-3.5" />} score={score.company_size_score} max={20} />
          <ScoreBar label="Potentiel mensuel" icon={<TrendingUp className="h-3.5 w-3.5" />} score={score.monthly_potential_score} max={20} />
          <ScoreBar label="Urgence" icon={<Clock className="h-3.5 w-3.5" />} score={score.urgency_score} max={20} />
          <ScoreBar label="Décideur identifié" icon={<UserCheck className="h-3.5 w-3.5" />} score={score.decision_maker_score} max={20} />
        </div>

        {/* Input fields */}
        {!readOnly && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label>Budget estimé (EUR)</Label>
              <Input
                type="number"
                min={0}
                value={budgetEstimate ?? ''}
                onChange={e => { setBudgetEstimate(Number(e.target.value) || null); handleChange() }}
                placeholder="Ex: 10000"
              />
            </div>
            <div>
              <Label>Taille entreprise</Label>
              <Select value={companySize ?? ''} onValueChange={v => { setCompanySize(v); handleChange() }}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="micro">Micro (1-9)</SelectItem>
                  <SelectItem value="petite">Petite (10-49)</SelectItem>
                  <SelectItem value="moyenne">Moyenne (50-249)</SelectItem>
                  <SelectItem value="grande">Grande (250+)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Potentiel mensuel (EUR)</Label>
              <Input
                type="number"
                min={0}
                value={monthlyPotential ?? ''}
                onChange={e => { setMonthlyPotential(Number(e.target.value) || null); handleChange() }}
                placeholder="Ex: 2000"
              />
            </div>
            <div>
              <Label>Urgence</Label>
              <Select value={urgencyLevel} onValueChange={v => { setUrgencyLevel(v as typeof urgencyLevel); handleChange() }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="faible">Faible</SelectItem>
                  <SelectItem value="moyen">Moyen</SelectItem>
                  <SelectItem value="eleve">Élevé</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox
                id="decision-maker"
                checked={hasDecisionMaker}
                onCheckedChange={(v) => { setHasDecisionMaker(!!v); handleChange() }}
              />
              <Label htmlFor="decision-maker" className="cursor-pointer">Décideur identifié</Label>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ScoreBar({ label, icon, score, max }: { label: string; icon: React.ReactNode; score: number; max: number }) {
  const pct = (score / max) * 100
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 w-[140px] text-sm text-muted-foreground shrink-0">
        {icon}
        {label}
      </div>
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-blue-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-semibold w-12 text-right tabular-nums">{score}/{max}</span>
    </div>
  )
}
