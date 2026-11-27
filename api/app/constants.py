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
}


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
