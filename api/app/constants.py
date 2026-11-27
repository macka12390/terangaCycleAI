"""Vocabulaire métier partagé : catégories, rôles et statuts (valeurs du contrat d'API)."""

CATEGORIES: dict[str, str] = {
    "plastic": "Plastique",
    "metal": "Métal",
    "paper": "Papier et carton",
    "glass": "Verre",
    "organic": "Déchets organiques",
}

ROLES: dict[str, str] = {
    "citizen": "Citoyen",
    "admin": "Administrateur",
    "collector": "Collecteur",
    "superadmin": "Super administrateur",
}

# Types d'organisation qui traitent les signalements (étape 3, multi-organisations).
ORGANISATION_KINDS: dict[str, str] = {
    "commune": "Commune",
    "ucg": "UCG (gestion des déchets)",
    "ong": "ONG ou association",
    "entreprise": "Entreprise de collecte",
}

# Organisation créée au premier démarrage : elle reçoit les données d'avant l'étape 3.
# Zone : région de Dakar (Dakar, Pikine, Guédiawaye, Rufisque ouest).
DEFAULT_ORGANISATION = {
    "name": "Organisation principale (Dakar)",
    "kind": "ucg",
    "min_lat": 14.60,
    "max_lat": 14.90,
    "min_lng": -17.56,
    "max_lng": -17.10,
}

# Rôles rattachés à une organisation (les citoyens et le super admin ne le sont pas).
ORGANISATION_ROLES = ("admin", "collector")

# Rôles qui ont accès à la console d'administration (le super admin hérite de l'admin).
ADMIN_ROLES = ("admin", "superadmin")


class ReportStatus:
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ASSIGNED = "assigned"
    COLLECTED = "collected"
    COMPLETED = "completed"


REPORT_STATUS_LABELS: dict[str, str] = {
    ReportStatus.PENDING: "En attente de modération",
    ReportStatus.APPROVED: "Validé — mission disponible",
    ReportStatus.REJECTED: "Rejeté",
    ReportStatus.ASSIGNED: "Collecte en cours",
    ReportStatus.COLLECTED: "Collecté — preuve en vérification",
    ReportStatus.COMPLETED: "Terminé — kilos vérifiés",
}

# Signalements qui sont passés par la validation humaine.
VALIDATED_REPORT_STATUSES = (
    ReportStatus.APPROVED,
    ReportStatus.ASSIGNED,
    ReportStatus.COLLECTED,
    ReportStatus.COMPLETED,
)


class MissionStatus:
    AVAILABLE = "available"
    ACCEPTED = "accepted"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


MISSION_STATUS_LABELS: dict[str, str] = {
    MissionStatus.AVAILABLE: "Disponible",
    MissionStatus.ACCEPTED: "Acceptée",
    MissionStatus.COMPLETED: "Terminée",
    MissionStatus.CANCELLED: "Annulée",
}


class ProofStatus:
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"
    DISPUTED = "disputed"


PROOF_STATUS_LABELS: dict[str, str] = {
    ProofStatus.PENDING: "En attente de vérification",
    ProofStatus.VERIFIED: "Vérifiée",
    ProofStatus.REJECTED: "Rejetée",
    ProofStatus.DISPUTED: "Contestée",
}


class AiMode:
    MODEL = "model"
    PROTOTYPE = "prototype"
    MANUAL = "manual"


AI_MODE_LABELS: dict[str, str] = {
    AiMode.MODEL: "Prédiction du modèle IA (évalué)",
    AiMode.PROTOTYPE: "Suggestion d'un classificateur IA expérimental (prototype)",
    AiMode.MANUAL: "Classification manuelle : aucun modèle IA n'est actif",
}

TEXT_MAX_LENGTH = 500
MAX_WEIGHT_KG = 10_000
