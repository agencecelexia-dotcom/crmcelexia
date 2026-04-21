export interface QuizQuestion {
  question: string
  options: string[]
  correctIndex: number
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    question: 'Dans quelle colonne apparaît un lead quand il vient d\'arriver ?',
    options: ['Qualifié', 'Nouveau', 'Devis envoyé', 'Signé'],
    correctIndex: 1,
  },
  {
    question: 'Comment déplacer un lead d\'une colonne à l\'autre dans le kanban ?',
    options: [
      'En cliquant sur un bouton "Changer statut"',
      'En faisant un glisser-déposer (drag & drop)',
      'En envoyant un email à Celexia',
      'Ce n\'est pas possible',
    ],
    correctIndex: 1,
  },
  {
    question: 'Que devez-vous faire quand un client signe un devis ?',
    options: [
      'Rien, Celexia le fait automatiquement',
      'Envoyer un email à Celexia',
      'Cliquer sur "Marquer comme signé" et entrer le montant',
      'Supprimer le lead',
    ],
    correctIndex: 2,
  },
  {
    question: 'Quels champs sont obligatoires pour créer un nouveau lead ?',
    options: [
      'Nom et email uniquement',
      'Nom, téléphone et type de travaux',
      'Tous les champs sont obligatoires',
      'Aucun champ n\'est obligatoire',
    ],
    correctIndex: 1,
  },
  {
    question: 'Où retrouvez-vous le détail de vos commissions ?',
    options: [
      'Sur la page Dashboard uniquement',
      'Dans l\'onglet "Commission" du menu',
      'Par email chaque mois',
      'Ce n\'est pas visible',
    ],
    correctIndex: 1,
  },
]

export const QUIZ_PASS_SCORE = 3
