import { Clock, Check, Mail } from 'lucide-react'

export function PendingPage() {
  return (
    <div>
      <div style={{ textAlign: 'center', padding: '20px 0 40px' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--violet-100)', color: 'var(--violet-600)', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Clock size={32} />
        </div>
        <span className="p-tag p-tag-violet">En cours de validation</span>
        <h1 className="font-display" style={{ fontSize: 32, fontWeight: 700, marginTop: 16, marginBottom: 12 }}>
          Votre compte est en cours de validation
        </h1>
        <p style={{ fontSize: 16, color: 'var(--gray-600)', maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
          Thomas ou Antoine examine votre onboarding. Vous recevrez un email dès que votre campagne sera lancée — généralement sous 24 h.
        </p>
      </div>

      {/* Timeline */}
      <div className="p-card" style={{ padding: 28, marginBottom: 24 }}>
        <div className="timeline">
          {[
            ['done', 'Contrat signé', 'il y a 5 min'],
            ['done', 'Virement confirmé', 'il y a 4 min'],
            ['done', 'Accès Google Business invité', 'il y a 3 min'],
            ['done', 'Documents légaux téléversés', 'il y a 2 min'],
            ['done', 'Formation et QCM complétés', "à l'instant"],
            ['current', 'Validation par Celexia', 'en attente · 24 h max'],
            ['', 'Lancement de votre campagne', ''],
          ].map(([status, label, time], i) => (
            <div className="timeline-item" key={i}>
              <div className={`timeline-dot ${status}`}>
                {status === 'done' ? <Check size={12} /> : status === 'current' ? <Clock size={12} /> : null}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 2 }}>
                <div style={{ fontSize: 14, fontWeight: status === 'current' ? 600 : 500, color: status ? 'var(--gray-900)' : 'var(--gray-400)' }}>{label}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <a href="mailto:agence.celexia@gmail.com" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          <Mail size={16} /> Contacter Celexia
        </a>
      </div>
    </div>
  )
}
