import { Clock, Check, Mail } from 'lucide-react'

export function PendingPage() {
  return (
    <div>
      <div className="px-2 py-5 text-center md:py-8">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 text-violet-600 sm:h-[72px] sm:w-[72px]">
          <Clock size={32} />
        </div>
        <span className="p-tag p-tag-violet">En cours de validation</span>
        <h1 className="font-display mt-4 mb-3 text-2xl font-bold leading-tight sm:text-3xl md:text-[32px]">
          Votre compte est en cours de validation
        </h1>
        <p className="mx-auto max-w-[520px] text-sm leading-relaxed text-gray-600 sm:text-base">
          Thomas ou Antoine examine votre onboarding. Vous recevrez un email dès que votre campagne sera lancée — généralement sous 24 h.
        </p>
      </div>

      <div className="p-card mb-6 p-5 sm:p-7">
        <div className="timeline">
          {[
            ['done', 'Contrat signé', 'il y a 5 min'],
            ['done', 'Virement confirmé', 'il y a 4 min'],
            ['done', 'Accès Google Business invité', 'il y a 3 min'],
            ['done', 'Documents légaux téléversés', 'il y a 2 min'],
            ['current', 'Validation par Celexia', 'en attente · 24 h max'],
            ['', 'Lancement de votre campagne', ''],
          ].map(([status, label, time], i) => (
            <div className="timeline-item" key={i}>
              <div className={`timeline-dot ${status}`}>
                {status === 'done' ? <Check size={12} /> : status === 'current' ? <Clock size={12} /> : null}
              </div>
              <div className="flex flex-col gap-0.5 pt-0.5 sm:flex-row sm:justify-between sm:gap-3">
                <div className={`text-sm ${status === 'current' ? 'font-semibold' : 'font-medium'} ${status ? 'text-gray-900' : 'text-gray-400'}`}>
                  {label}
                </div>
                <div className="text-xs text-gray-500">{time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
        <a href="mailto:agence.celexia@gmail.com" className="btn btn-secondary no-underline">
          <Mail size={16} /> Contacter Celexia
        </a>
      </div>
    </div>
  )
}
