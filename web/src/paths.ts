// Chemins de la PWA, partagés par la table des routes et les liens.
export const PATHS = {
  home: '/',
  /** Entrée du signalement : redirige vers le consentement ou vers la capture. */
  report: '/signaler',
  consent: '/signaler/consentement',
  /** Espace citoyen (MVP 24 h) : signalement en un écran, QR code, suivi. */
  citizenReport: '/citizen/report',
  citizenQr: '/citizen/qr',
  citizenTracking: '/citizen/tracking/:id',
  /** Connexion par code SMS (comptes réels). */
  login: '/connexion',
  /** Mon compte : nom, SMS de suivi, déconnexion. */
  account: '/mon-compte',
  /** Comptes de démonstration (choix du rôle). */
  demo: '/demo',
  /** Espace collecteur. */
  collector: '/collector/missions',
  collectorMission: '/collector/missions/:id',
  /** Lots de matière du collecteur (étape 5). */
  collectorLots: '/collector/lots',
  /** Gains du collecteur (étape 6). */
  collectorEarnings: '/collector/gains',
  /** Espace recycleur : lots disponibles et réservations. */
  recycler: '/recycler/lots',
  /** Console administrateur. */
  admin: '/admin',
  adminReports: '/admin/reports',
  adminMissions: '/admin/missions',
  adminProofs: '/admin/proofs',
  adminMap: '/admin/map',
  /** Gestion des comptes (admin, super admin). */
  adminAccounts: '/admin/accounts',
  /** Organisations et zones (super admin). */
  adminOrganisations: '/admin/organisations',
  /** Journal des SMS envoyés. */
  adminNotifications: '/admin/sms',
  /** Lots vendus aux recycleurs. */
  adminLots: '/admin/lots',
  /** Paiements : tarifs, rémunérations, historique. */
  adminPayments: '/admin/payments',
} as const
