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
  /** Comptes de démonstration (choix du rôle). */
  demo: '/demo',
  /** Espace collecteur. */
  collector: '/collector/missions',
  collectorMission: '/collector/missions/:id',
  /** Console administrateur. */
  admin: '/admin',
  adminReports: '/admin/reports',
  adminMissions: '/admin/missions',
  adminProofs: '/admin/proofs',
  adminMap: '/admin/map',
} as const
