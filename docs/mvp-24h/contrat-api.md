# Contrat d'API — MVP 24 h (React ↔ Flask)

Document partagé entre le frontend (React + Vite, `web/`) et le backend (Flask + SQLite).
Toute modification se fait ici d'abord, puis des deux côtés. Proposition du 26/11/2026,
à valider par le développeur backend.

## Conventions

- Préfixe `/api`. JSON UTF-8. Dates en ISO 8601 UTC (`2026-11-26T09:30:00Z`).
- Le frontend appelle des chemins relatifs (`/api/...`) ; en développement, Vite relaie
  `/api` et `/uploads` vers Flask (`http://127.0.0.1:5000`) : pas de CORS à gérer en dev.
- Authentification de démonstration : `Authorization: Bearer <token>` (jeton renvoyé par
  `POST /api/auth/demo`). Le citoyen peut signaler sans jeton.
- Erreur, toujours la même forme :

```json
{ "error": { "code": "mission_already_taken", "message": "Cette mission a déjà été acceptée." } }
```

| HTTP | Cas |
|---|---|
| 400 | données invalides (`validation_error`, `invalid_photo`, `invalid_weight`…) |
| 401 | jeton absent ou invalide (`unauthorized`) |
| 403 | rôle insuffisant ou collecteur non vérifié (`forbidden`, `collector_not_verified`) |
| 404 | introuvable (`not_found`) |
| 409 | statut incompatible (`invalid_status`, `mission_already_taken`) |
| 413 | fichier trop lourd (`file_too_large`) |

## Énumérations

| Nom | Valeurs |
|---|---|
| `category` | `plastic`, `metal`, `paper`, `glass`, `organic` (papier et carton = `paper`) |
| `report.status` | `pending`, `validated`, `rejected` |
| `mission.status` | `available`, `accepted`, `completed`, `cancelled` |
| `proof.status` | `pending`, `verified`, `rejected`, `contested` |
| `role` | `citizen`, `collector`, `admin` |
| `ai_mode` | `model` (prédiction d'un vrai modèle), `manual` (aucun modèle : classification manuelle, affichée comme telle) |

## Objets

```jsonc
// User
{ "id": 1, "name": "Collecteur démo", "role": "collector", "is_verified": true, "is_demo": true }

// Report
{
  "id": 12,
  "tracking_number": "TC-2026-000012",
  "photo_url": "/uploads/reports/abc.jpg",
  "latitude": 14.6708, "longitude": -17.4381,
  "comment": "Près du marché",            // ou null
  "voice_url": null,                      // note vocale (wolof/français), facultative, P1
  "ai_category": "plastic",               // ou null si ai_mode = manual
  "ai_confidence": 0.87,                  // 0..1, ou null
  "ai_mode": "model",
  "citizen_category": null,               // correction du citoyen, ou null
  "final_category": null,                 // fixée par le modérateur à la validation
  "status": "pending",
  "rejection_reason": null,
  "created_at": "…", "updated_at": "…",
  "is_demo": false
}

// Mission
{
  "id": 5, "report_id": 12, "status": "available",
  "collector_id": null, "collector_name": null,
  "category": "plastic", "latitude": 14.6708, "longitude": -17.4381,
  "photo_url": "/uploads/reports/abc.jpg",
  "created_at": "…", "accepted_at": null, "completed_at": null
}

// Proof
{
  "id": 3, "mission_id": 5, "after_photo_url": "/uploads/proofs/def.jpg",
  "collected_weight_kg": 42.5, "comment": null, "status": "pending",
  "verified_by": null, "verified_at": null, "created_at": "…",
  "mission": { /* Mission */ }
}
```

## Routes

### Santé et authentification de démonstration

| Méthode | Chemin | Corps | Réponse |
|---|---|---|---|
| GET | `/api/health` | — | `{ "status": "ok" }` |
| GET | `/api/config` | — | `{ "demo_mode": true }` : affiche le bandeau « Mode démonstration » |
| POST | `/api/auth/demo` | `{ "role": "collector" }` | `{ "token": "…", "user": User }` |
| GET | `/api/auth/me` | — (jeton) | `User` |

### Signalements

| Méthode | Chemin | Rôle | Corps / filtres | Réponse |
|---|---|---|---|---|
| POST | `/api/reports` | tous | multipart : `photo` (JPEG/PNG/WebP, ≤ 5 Mo), `latitude`, `longitude`, `comment`?, `citizen_category`?, `client_id` (UUID, anti-doublon), `voice`? | 201 `Report` (classification IA incluse) ; 200 `Report` existant si `client_id` déjà reçu |
| GET | `/api/reports` | admin | `?status=pending` | `{ "items": [Report] }` |
| GET | `/api/reports/<id>` | tous | `id` ou `tracking_number` | `Report` |
| PATCH | `/api/reports/<id>/moderate` | admin | `{ "action": "validate", "final_category": "plastic" }` ou `{ "action": "reject", "reason": "…" }` | `{ "report": Report, "mission": Mission \| null }` (mission créée à la validation) |

### Missions

| Méthode | Chemin | Rôle | Corps / filtres | Réponse |
|---|---|---|---|---|
| GET | `/api/missions` | collecteur, admin | `?scope=available` ou `?scope=mine` | `{ "items": [Mission] }` |
| GET | `/api/missions/<id>` | collecteur, admin | — | `Mission` |
| POST | `/api/missions/<id>/accept` | collecteur vérifié | — | `Mission` ; 409 si déjà prise ; 403 si non vérifié |
| POST | `/api/missions/<id>/proof` | collecteur de la mission | multipart : `after_photo`, `collected_weight_kg` (> 0), `comment`? | 201 `Proof` ; la mission passe à `completed` |

`POST /api/missions/<id>/complete` du cahier des charges est fusionné avec l'envoi de la
preuve : une mission est terminée quand sa preuve est envoyée.

### Preuves

| Méthode | Chemin | Rôle | Corps / filtres | Réponse |
|---|---|---|---|---|
| GET | `/api/proofs` | admin | `?status=pending` | `{ "items": [Proof] }` |
| PATCH | `/api/proofs/<id>/verify` | admin | `{ "action": "verify" \| "reject" \| "contest" }` | `Proof` |

### Tableau de bord

`GET /api/dashboard/stats` (admin) :

```json
{
  "reports_total": 12, "reports_pending": 3, "reports_validated": 7, "reports_rejected": 2,
  "missions_available": 2, "collections_completed": 4, "proofs_pending": 1,
  "verified_kg": 168.5,
  "kg_by_category": { "plastic": 80, "metal": 20.5, "paper": 30, "glass": 18, "organic": 20 },
  "collections_by_day": [ { "date": "2026-11-26", "count": 2, "kg": 60 } ],
  "recent_activity": [ { "at": "…", "type": "proof_verified", "label": "Collecte TC-2026-000012 vérifiée (42,5 kg)" } ],
  "includes_demo_data": true
}
```

Les kilogrammes ne comptent que les preuves `verified`.

## Règles que le backend garantit (le frontend les affiche, ne les décide pas)

1. Numéro de suivi unique. 2. Mission créée seulement depuis un signalement validé.
3. Collecteur non vérifié : 403. 4. Mission déjà acceptée : 409. 5. Preuve liée à une
mission. 6. Poids > 0. 7. Seules les preuves `verified` comptent. 8. L'IA propose,
l'humain décide (`final_category` fixée par le modérateur). 9. Données de démo marquées
`is_demo`. 10. Fichiers contrôlés (type, taille). 11. Ni coordonnées ni données
personnelles dans les journaux.
