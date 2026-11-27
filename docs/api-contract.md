# Contrat d'API — TerangaCycle AI (MVP hackathon)

Contrat partagé entre le frontend React et le backend Flask (`api/`).
Toute modification de ce fichier se fait **à deux** : le backend s'engage à respecter exactement ces formats.

- Base : `http://localhost:5000/api`
- Recommandé côté frontend : un proxy Vite `/api → http://localhost:5000` (pas de CORS, les URL de photos relatives marchent, et le téléphone n'a qu'une seule origine à joindre).

```js
// vite.config.js
server: { proxy: { '/api': 'http://localhost:5000' } }
```

## 1. Conventions

### Enveloppe de réponse

Succès :

```json
{ "success": true, "report": { ... } }
```

Erreur (toujours ce format, message en français lisible par l'utilisateur) :

```json
{
  "success": false,
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "Ce signalement a déjà été traité.",
    "details": { "status": "approved" }
  }
}
```

| HTTP | `code` | Quand |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Champ manquant ou invalide (`details.field` indique lequel) |
| 401 | `UNAUTHORIZED` | Jeton absent, invalide ou expiré |
| 403 | `FORBIDDEN` | Rôle non autorisé ou ressource d'un autre utilisateur |
| 403 | `COLLECTOR_NOT_VERIFIED` | Collecteur non vérifié qui tente d'accepter une mission |
| 403 | `DEMO_DISABLED` | Comptes de démonstration désactivés (`DEMO_AUTH_ENABLED=false`) |
| 400 | `OTP_INVALID` | Code SMS incorrect (`details.remaining_attempts`) |
| 400 | `OTP_EXPIRED` | Code expiré, déjà utilisé ou jamais demandé |
| 429 | `OTP_LOCKED` | 5 codes faux : demander un nouveau code |
| 429 | `OTP_TOO_SOON` / `OTP_RATE_LIMITED` | 1 code par minute, 3 par quart d'heure (`details.retry_after` en secondes) |
| 502 | `SMS_FAILED` | Le fournisseur de SMS a échoué |
| 403 | `ACCOUNT_SUSPENDED` | Compte suspendu : connexion et jetons refusés |
| 403 | `DEMO_ACCOUNT_LOCKED` | Les comptes de démonstration ne sont pas modifiables |
| 409 | `PHONE_TAKEN` | Un compte existe déjà avec ce numéro |
| 409 | `LAST_SUPERADMIN` | Dernier super admin réel actif : ni rétrogradé ni suspendu |
| 409 | `NAME_TAKEN` | Une organisation porte déjà ce nom |
| 404 | `NOT_FOUND` | Ressource ou route inconnue |
| 409 | `INVALID_TRANSITION` | Le statut actuel ne permet pas l'opération |
| 409 | `MISSION_ALREADY_TAKEN` | Mission déjà acceptée par un autre collecteur |
| 413 | `FILE_TOO_LARGE` | Photo de plus de 8 Mo |
| 415 | `UNSUPPORTED_FILE` | Fichier qui n'est pas une image JPEG, PNG ou WebP |
| 500 | `INTERNAL_ERROR` | Erreur inattendue |

### Authentification de démonstration

Pas de mot de passe ni d'OTP : on choisit un compte de démonstration et on reçoit un jeton signé (valable 7 jours).
**Ce n'est pas une sécurité de production.**

```
Authorization: Bearer <token>
```

### Dates, catégories, photos

- Dates en ISO 8601 UTC : `"2026-11-26T12:00:00Z"`.
- Catégories de déchet (`category`) : `plastic`, `metal`, `paper`, `glass`, `organic`.
  Libellés : Plastique, Métal, Papier et carton, Verre, Déchets organiques.
- Photos : URL relatives (`"/api/uploads/reports/3f2a….jpg"`). Le serveur ré-encode chaque photo en JPEG (max 1600 px) et **supprime toutes les métadonnées EXIF** (dont le GPS de l'appareil).
- Envoi des photos en `multipart/form-data`, champ `photo`.

## 2. Statuts

### Signalement (`report.status`)

| Valeur | Libellé | Passage |
|---|---|---|
| `pending` | En attente de modération | Création |
| `approved` | Validé — mission disponible | Admin valide |
| `rejected` | Rejeté | Admin rejette (**ne devient jamais une mission**) |
| `assigned` | Collecte en cours | Un collecteur accepte la mission |
| `collected` | Collecté — preuve en vérification | Le collecteur envoie sa preuve |
| `completed` | Terminé — kilos vérifiés | Admin vérifie la preuve |

### Mission (`mission.status`)

`available` → `accepted` → `completed`.
`accepted` → `available` : mission **libérée** (`/release`).
`available` ou `accepted` → `cancelled` : mission **annulée** par l'admin (`/cancel`) ; le signalement passe alors à `rejected`.
Si la preuve est **rejetée**, la mission repasse à `accepted` : le collecteur renvoie une nouvelle preuve.

### Preuve (`proof.status`)

`pending` → `verified` | `rejected` | `disputed` ; `disputed` → `verified` | `rejected`.
**Seules les preuves `verified` comptent dans les kilos.**

```
Report:  pending ─┬─► approved ─► assigned ─► collected ─► completed
                  └─► rejected                  ▲   │
                                                │   └─(preuve rejetée)─► assigned
Mission:          available ─► accepted ─► completed ─(preuve rejetée)─► accepted
Proof:                                      pending ─► verified | rejected | disputed
```

## 3. Objets

### `user`

```json
{ "id": 3, "name": "Collecteur Démo (vérifié)", "role": "collector",
  "is_verified": true, "is_demo": true, "demo_login": "collecteur-demo", "phone": null }
```

Compte réel : `"is_demo": false`, `"demo_login": null`, `"phone": "+221771234567"`.

`role` : `citizen`, `collector`, `admin` ou `superadmin` (le super admin a tous les droits de l'admin, plus la gestion des admins et le journal d'audit).

`organisation` : `{ id, name, is_demo }` ou `null` (citoyen, super admin).

`sms_notifications` : la personne accepte (true) ou non les SMS de suivi (étape 4).

Champs de gestion (étape 2) : `role_label`, `is_active`, `suspended_at`, `suspended_reason`, `created_at`, `last_login_at`.

### `ai` (résultat de classification)

```json
{
  "mode": "prototype",
  "category": "plastic",
  "confidence": 0.82,
  "suggested_category": "plastic",
  "threshold": 0.6,
  "model_version": "clip-vit-base-patch32-zeroshot-v1",
  "scores": { "plastic": 0.82, "metal": 0.05, "paper": 0.06, "glass": 0.04, "organic": 0.03 },
  "label": "Suggestion d'un classificateur IA expérimental (prototype)"
}
```

- `mode` : `model` (modèle évalué), `prototype` (classificateur expérimental) ou `manual` (aucune IA active : `category`, `confidence`, `scores` valent `null`).
- **`suggested_category`** = `category` si `confidence ≥ threshold` (60 %), sinon `null`.
  Le frontend ne présélectionne **que** `suggested_category`. Sous 60 %, rien n'est présélectionné.
- Afficher `label` à côté du résultat : le jury doit voir d'où vient la proposition.

### `report`

```json
{
  "id": 12,
  "tracking_number": "TC-2026-7KQ4MX",
  "status": "pending",
  "status_label": "En attente de modération",
  "photo_url": "/api/uploads/reports/3f2a9c….jpg",
  "latitude": 14.7167,
  "longitude": -17.4677,
  "accuracy_m": 12.0,
  "comment": "Dépôt sauvage près de la route",
  "voice_url": "/api/uploads/voices/8d1e….webm",
  "ai": { "...": "objet ai, sans threshold ni scores" },
  "citizen_category": "plastic",
  "final_category": null,
  "category": "plastic",
  "rejection_reason": null,
  "moderated_by": null,
  "moderated_at": null,
  "mission_id": null,
  "user_id": 1,
  "is_demo": false,
  "created_at": "2026-11-26T12:00:00Z",
  "updated_at": "2026-11-26T12:00:00Z"
}
```

`voice_url` : note vocale du citoyen (wolof ou français), ou `null`. À lire avec `<audio controls src={voice_url}>` dans la modération.

`organisation` : `{ id, name, is_demo }` de l'organisation qui traite le dépôt, ou `null` s'il est **hors de toute zone** (visible du seul super admin, qui le rattache). Présent aussi sur `mission`.

`category` est la meilleure catégorie connue, pour l'affichage : `final_category` (décidée par l'admin), sinon `citizen_category`, sinon `ai.suggested_category`.

`is_demo: true` : donnée de démonstration chargée par `flask seed-demo`. **À afficher avec un badge « Démo ».**

### `mission`

```json
{
  "id": 4,
  "status": "accepted",
  "status_label": "Acceptée",
  "report_id": 12,
  "tracking_number": "TC-2026-7KQ4MX",
  "latitude": 14.7167,
  "longitude": -17.4677,
  "waste_type": "plastic",
  "photo_before_url": "/api/uploads/reports/3f2a9c….jpg",
  "report_comment": "Dépôt sauvage près de la route",
  "collector": { "id": 3, "name": "Collecteur Démo (vérifié)" },
  "accepted_at": "2026-11-26T12:10:00Z",
  "started_at": null,
  "completed_at": null,
  "created_at": "2026-11-26T12:05:00Z",
  "proof": null,
  "is_demo": false
}
```

`proof` : la dernière preuve de la mission (objet `proof` ci-dessous) ou `null`.

### `proof`

```json
{
  "id": 7,
  "mission_id": 4,
  "status": "pending",
  "status_label": "En attente de vérification",
  "photo_after_url": "/api/uploads/proofs/91bc….jpg",
  "weight_kg": 23.5,
  "comment": "Sacs déposés au point de tri",
  "collector": { "id": 3, "name": "Collecteur Démo (vérifié)" },
  "verified_by": null,
  "verified_at": null,
  "review_note": null,
  "created_at": "2026-11-26T12:40:00Z",
  "report": {
    "id": 12, "tracking_number": "TC-2026-7KQ4MX",
    "waste_type": "plastic", "photo_before_url": "/api/uploads/reports/3f2a9c….jpg"
  },
  "is_demo": false
}
```

## 4. Routes

Légende accès : 🌐 public · 👤 citoyen (jeton facultatif) · 🛡️ admin · 🚛 collecteur.

### Système

| Méthode | Route | Accès | Réponse |
|---|---|---|---|
| GET | `/api/health` | 🌐 | `{ success, status: "ok", ai_mode, version }` |
| GET | `/api/config` | 🌐 | `{ success, config: { categories, report_statuses, mission_statuses, proof_statuses, ai, demo_mode, max_upload_mb } }` |

`config.categories` = `[{ "value": "plastic", "label": "Plastique" }, …]` (même forme pour les statuts).

### Authentification de démonstration

| Méthode | Route | Accès | Corps | Réponse |
|---|---|---|---|---|
| GET | `/api/auth/demo-accounts` | 🌐 | — | `{ success, accounts: [user] }` |
| POST | `/api/auth/demo` | 🌐 | `{ "login": "admin-demo" }` | `{ success, token, user }` |
| GET | `/api/auth/me` | jeton | — | `{ success, user }` |
| PATCH | `/api/auth/me` | jeton (compte réel) | `{ "name"?, "sms_notifications"? }` | `{ success, user }` (403 `DEMO_ACCOUNT_LOCKED` pour un compte de démo) |

Comptes : `citoyen-demo`, `admin-demo` (organisation principale), `admin-pikine-demo` (UCG Pikine-Guédiawaye), `superadmin-demo`, `collecteur-demo` (vérifié), `collecteur-non-verifie` (pour montrer le refus).
`demo-accounts` renvoie aussi `demo_enabled` ; s'il vaut `false`, n'afficher que la connexion par SMS.

### Connexion par code SMS (OTP)

| Méthode | Route | Accès | Corps | Réponse |
|---|---|---|---|---|
| POST | `/api/auth/otp/request` | 🌐 | `{ "phone": "77 123 45 67" }` | `{ success, phone: "+221771234567", expires_in: 300, resend_in: 60 }` |
| POST | `/api/auth/otp/verify` | 🌐 | `{ "phone": "77 123 45 67", "code": "123456", "name": "Awa" }` | 201 (compte créé) ou 200 : `{ success, token, user, created }` |

- Numéro : mobile sénégalais, toutes écritures acceptées (`77 123 45 67`, `+221…`, `00221…`).
- Code : 6 chiffres, valable 5 minutes, 5 essais. Un nouveau code annule le précédent.
- Premier code vérifié pour un numéro inconnu : compte **citoyen** créé (`name` facultatif, « Citoyen » par défaut). Les comptes **collecteur** et **admin** sont créés à l'avance (`flask --app run create-user`) ; leur titulaire se connecte ensuite par SMS.
- Le jeton s'utilise exactement comme celui de la démo (`Authorization: Bearer`).
- Mode test (`SMS_PROVIDER=console`, par défaut) : aucun SMS n'est envoyé, le message s'affiche dans le terminal du backend (numéro masqué). Avec `OTP_EXPOSE_CODE=true`, la réponse de `/otp/request` contient aussi `dev_code`, pour une démo sur scène ; à ne jamais activer avec un vrai fournisseur.

### Classification IA

| Méthode | Route | Accès | Corps | Réponse |
|---|---|---|---|---|
| POST | `/api/ai/classify` | 🌐 | multipart `photo` | `{ success, ai }` |

Aperçu sans rien enregistrer : le citoyen voit la proposition et peut la corriger **avant** d'envoyer.
`POST /api/reports` reclassifie côté serveur (la valeur enregistrée est celle du serveur, jamais celle envoyée par le client) ; si les mêmes octets ont déjà été classifiés, le résultat est réutilisé.

### Signalements

| Méthode | Route | Accès | Réponse |
|---|---|---|---|
| POST | `/api/reports` | 👤 | 201 `{ success, report, ai, duplicate: false }` |
| GET | `/api/reports` | 🛡️ tous · 👤 avec jeton : les siens | `{ success, reports: [report], total }` |
| GET | `/api/reports/<id>` | 🛡️ · auteur | `{ success, report, mission, history }` |
| GET | `/api/reports/track/<tracking_number>` | 🌐 | `{ success, tracking }` |
| PATCH | `/api/reports/<id>/moderate` | 🛡️ | `{ success, report, mission }` |

**`POST /api/reports`** — `multipart/form-data` :

| Champ | Obligatoire | Règle |
|---|---|---|
| `photo` | oui | JPEG, PNG ou WebP, ≤ 8 Mo |
| `latitude` | oui | -90 à 90 |
| `longitude` | oui | -180 à 180 |
| `accuracy_m` | non | ≥ 0 (précision GPS en mètres) |
| `comment` | non | ≤ 500 caractères |
| `citizen_category` | non | une catégorie : choix ou correction du citoyen |
| `client_uuid` | non | UUID généré par le client (anti-doublon hors ligne) |
| `voice` | non | Note vocale ≤ 2 Mo : WebM, Ogg, MP4/M4A, WAV ou MP3, reconnue par son contenu (le nom `note.webm` suffit). Invalide → 415, trop lourde → 413, et rien n'est enregistré |

Si `client_uuid` a déjà été reçu : **200** avec le signalement existant et `"duplicate": true` (aucun doublon créé).

**`GET /api/reports`** — filtres : `status`, `category`, `limit` (défaut 50, max 200), `offset`. Tri : plus récent d'abord.

**`GET /api/reports/<id>`** — `history` = journal des décisions :

```json
[{ "entity": "report", "entity_label": "Signalement", "entity_id": 12,
   "from_status": null, "from_status_label": null,
   "to_status": "pending", "to_status_label": "En attente de modération",
   "summary": "Signalement : En attente de modération",
   "actor": null, "note": null, "at": "2026-11-26T12:00:00Z" }]
```

Afficher `summary` (ou `to_status_label`), jamais `to_status` brut.

**`GET /api/reports/track/<tracking_number>`** — suivi public, sans photo ni position :

```json
{ "success": true, "tracking": {
  "tracking_number": "TC-2026-7KQ4MX", "status": "approved",
  "status_label": "Validé — mission disponible", "category": "plastic",
  "created_at": "…", "updated_at": "…",
  "history": [{ "status": "pending", "label": "En attente de modération", "at": "…" }] } }
```

**`PATCH /api/reports/<id>/moderate`** — JSON :

```json
{ "action": "approve", "final_category": "plastic" }
{ "action": "reject", "reason": "Photo floue, dépôt non identifiable" }
{ "action": "correct", "final_category": "metal" }
```

- `approve` : seulement depuis `pending`. Crée la mission (`available`). `final_category` facultatif si une catégorie est déjà connue (correction admin, choix du citoyen, ou suggestion IA ≥ 60 %), sinon 400.
- `reject` : seulement depuis `pending`. `reason` facultatif (≤ 500).
- `correct` : change `final_category` tant que les kilos ne sont pas vérifiés (pas sur `rejected` ni `completed`).
- Valider deux fois → 409 `INVALID_TRANSITION`.

### Missions

| Méthode | Route | Accès | Réponse |
|---|---|---|---|
| GET | `/api/missions` | 🚛 · 🛡️ | `{ success, missions: [mission] }` |
| GET | `/api/missions/<id>` | 🚛 (disponible ou la sienne) · 🛡️ | `{ success, mission }` |
| POST | `/api/missions/<id>/accept` | 🚛 vérifié | `{ success, mission }` |
| POST | `/api/missions/<id>/start` | 🚛 titulaire | `{ success, mission }` |
| POST | `/api/missions/<id>/proof` | 🚛 titulaire | 201 `{ success, proof, mission }` |
| POST | `/api/missions/<id>/complete` | 🚛 titulaire | alias de `/proof` (mêmes champs) |
| POST | `/api/missions/<id>/release` | 🚛 titulaire · 🛡️ | `{ success, mission }` |
| POST | `/api/missions/<id>/cancel` | 🛡️ | `{ success, mission }` |

**`GET /api/missions`** — collecteur : `?scope=available` (défaut) ou `?scope=mine` (ses missions : historique). Admin : toutes, filtre `?status=`.

**`POST /api/missions/<id>/accept`** — sans corps. Collecteur non vérifié → 403 `COLLECTOR_NOT_VERIFIED`. Déjà prise → 409 `MISSION_ALREADY_TAKEN`. L'acceptation est atomique : deux collecteurs simultanés, un seul gagne.

**`POST /api/missions/<id>/start`** — début d'intervention (facultatif) : renseigne `started_at`.

**`POST /api/missions/<id>/proof`** — `multipart/form-data` :

| Champ | Obligatoire | Règle |
|---|---|---|
| `photo` | oui | photo après collecte |
| `weight_kg` | oui | nombre > 0 et ≤ 10 000 (virgule ou point acceptés) |
| `comment` | non | ≤ 500 caractères |

Fin d'intervention : mission → `completed`, signalement → `collected`, preuve → `pending`. **Les kilos ne comptent pas encore.**

**`POST /api/missions/<id>/release`** — JSON facultatif `{ "reason": "Acceptée par erreur" }`. Mission `accepted` sans preuve en attente → `available` (collecteur retiré) ; signalement `assigned` → `approved`. Le collecteur titulaire ou un admin. Sinon 409.

**`POST /api/missions/<id>/cancel`** — admin, JSON facultatif `{ "reason": "Dépôt déjà enlevé" }`. Mission `available` ou `accepted` → `cancelled` ; signalement → `rejected` avec `rejection_reason = "Mission annulée : <motif>"`. Impossible une fois la preuve envoyée (vérifier ou rejeter la preuve d'abord) → 409.

### Preuves

| Méthode | Route | Accès | Réponse |
|---|---|---|---|
| GET | `/api/proofs` | 🛡️ toutes · 🚛 les siennes | `{ success, proofs: [proof] }` |
| PATCH | `/api/proofs/<id>/verify` | 🛡️ | `{ success, proof, mission, report }` |

Filtre : `?status=pending`.

```json
{ "decision": "verified" }
{ "decision": "rejected", "note": "Le dépôt est encore visible sur la photo" }
{ "decision": "disputed", "note": "Poids incohérent avec la photo" }
```

- `verified` : signalement → `completed`, **les kilos sont comptés**.
- `rejected` : mission → `accepted`, signalement → `assigned` ; le collecteur doit renvoyer une preuve.
- `disputed` : en attente d'arbitrage, non comptée ; peut ensuite être `verified` ou `rejected`.

### Tableau de bord

| Méthode | Route | Accès | Réponse |
|---|---|---|---|
| GET | `/api/dashboard/stats` | 🛡️ | `{ success, stats }` |

Paramètre : `include_demo` (`true` par défaut ; `false` pour exclure les données de démonstration).
Tout est calculé à la volée depuis la base.

```json
{
  "reports": { "total": 12, "pending": 3, "validated": 7, "rejected": 2, "by_status": { "pending": 3, "...": 0 } },
  "missions": { "available": 1, "accepted": 2, "completed": 3, "cancelled": 0 },
  "collections": { "completed": 3, "verified": 2 },
  "proofs": { "pending": 1, "disputed": 0, "verified": 2, "rejected": 1 },
  "verified_kg": 61.5,
  "kg_by_category": [{ "category": "plastic", "label": "Plastique", "kg": 41.5 }, "… les 5 catégories, 0 inclus"],
  "reports_by_category": [{ "category": "plastic", "label": "Plastique", "count": 5 }, "…"],
  "collections_timeline": [{ "date": "2026-11-26", "verified_kg": 23.5, "collections": 1 }, "… 14 derniers jours"],
  "recent_activity": [{ "entity": "proof", "entity_label": "Preuve", "entity_id": 7, "report_id": 12,
                         "tracking_number": "TC-2026-7KQ4MX", "from_status": "pending",
                         "from_status_label": "En attente de vérification", "to_status": "verified",
                         "to_status_label": "Vérifiée", "summary": "Preuve : Vérifiée",
                         "actor": "Admin Démo", "note": null, "at": "…" }],
  "ai": { "by_mode": { "model": 0, "prototype": 8, "manual": 4 },
          "evaluated": 6, "agreement_rate": 0.83 },
  "demo": { "included": true, "demo_reports": 9 }
}
```

- `reports.validated` = signalements passés par la validation (`approved`, `assigned`, `collected`, `completed`).
- `collections.completed` = missions terminées (preuve envoyée) ; `collections.verified` = preuves vérifiées.
- `ai.agreement_rate` : part des signalements validés où la proposition IA (≥ 60 %) égale la catégorie finale. Calculée **uniquement** sur les modes `model` et `prototype` ; `null` s'il n'y a rien à évaluer. Le mode `manual` n'est jamais compté comme une performance IA.

### Comptes (étape 2)

| Méthode | Route | Accès | Corps | Réponse |
|---|---|---|---|---|
| GET | `/api/accounts` | 🛡️ | — | `{ success, accounts: [user], total, manageable_roles }` |
| POST | `/api/accounts` | 🛡️ | `{ "phone", "name", "role", "is_verified" }` | 201 `{ success, account }` |
| PATCH | `/api/accounts/<id>` | 🛡️ | `{ "name"?, "role"?, "is_verified"? }` | `{ success, account }` |
| POST | `/api/accounts/<id>/suspend` | 🛡️ | `{ "reason"? }` | `{ success, account, released_missions }` |
| POST | `/api/accounts/<id>/reactivate` | 🛡️ | — | `{ success, account }` |
| GET | `/api/audit` | super admin | — | `{ success, entries: [{ action, action_label, actor, target, details, at }] }` |

- Filtres de `GET /api/accounts` : `role`, `status` (`active` ou `suspended`), `q` (nom, ou au moins 3 chiffres du numéro), `limit`, `offset`.
- `manageable_roles` : rôles que l'utilisateur connecté peut attribuer. Admin : `citizen`, `collector`. Super admin : tous. Utiliser cette liste pour le menu des rôles.
- Personne ne modifie son propre compte ; les comptes de démo sont en lecture seule ; le dernier super admin réel actif est protégé.
- Suspendre un collecteur **libère ses missions acceptées** (elles redeviennent disponibles) ; celles dont la preuve attend une vérification ne bougent pas. Le compte suspendu ne peut plus se connecter et ses jetons sont refusés (403 `ACCOUNT_SUSPENDED`).
- Chaque création, modification, suspension et réactivation est inscrite au journal d'audit (numéro masqué).
- Premier super admin : `flask --app run create-user --phone "…" --name "…" --role superadmin`.

### Organisations (étape 3)

Une organisation (commune, UCG, ONG, entreprise de collecte) traite les dépôts de sa **zone** : un rectangle `min_lat`, `max_lat`, `min_lng`, `max_lng`. À la création, un signalement est rattaché à l'organisation **active** dont la zone le contient ; si plusieurs zones se chevauchent, **la plus petite l'emporte**. Hors de toute zone : `organisation: null`.

**Cloisonnement** : un admin ou un collecteur ne voit que les signalements, missions, preuves, statistiques et comptes de **son** organisation (plus les citoyens, sans organisation). Le super admin voit tout. Une ressource d'une autre organisation renvoie 403.

| Méthode | Route | Accès | Corps | Réponse |
|---|---|---|---|---|
| GET | `/api/organisations` | 🛡️ (admin : la sienne) | — | `{ success, organisations: [organisation], unassigned_reports? }` |
| POST | `/api/organisations` | super admin | `{ name, kind, min_lat, max_lat, min_lng, max_lng }` | 201 `{ success, organisation }` |
| PATCH | `/api/organisations/<id>` | super admin | mêmes champs, et `is_active` | `{ success, organisation }` |
| PATCH | `/api/reports/<id>/organisation` | super admin | `{ "organisation_id": 2 }` | `{ success, report }` |

```json
{ "id": 2, "name": "UCG Pikine-Guédiawaye (démo)", "kind": "ucg", "kind_label": "UCG (gestion des déchets)",
  "zone": { "min_lat": 14.73, "max_lat": 14.81, "min_lng": -17.42, "max_lng": -17.33 },
  "is_active": true, "is_demo": true, "created_at": "…",
  "counts": { "reports": 2, "admins": 1, "collectors": 0 } }
```

- `kind` : `commune`, `ucg`, `ong`, `entreprise`.
- `unassigned_reports` (super admin) : nombre de signalements hors zone à rattacher.
- Rattacher un signalement : seulement tant qu'aucun collecteur ne s'en occupe (`pending`, `approved`, `rejected`), sinon 409.
- Une organisation désactivée (`is_active: false`) ne reçoit plus de nouveaux signalements.
- Filtres super admin : `GET /api/reports?organisation_id=2` (ou `none` pour les hors zone), `GET /api/accounts?organisation_id=2`, `GET /api/dashboard/stats?organisation_id=2`.
- Comptes : un admin crée des collecteurs **de son organisation** ; le super admin doit préciser `organisation_id` pour un admin ou un collecteur (création ou changement de rôle) et peut déplacer un compte (`PATCH /api/accounts/<id>` avec `organisation_id`).
- Données d'avant l'étape 3 : rattachées au premier démarrage (organisation principale « Dakar », ou zone plus précise selon la position).

### Notifications SMS (étape 4)

Envoyées par le même fournisseur que les codes de connexion (`SMS_PROVIDER` ; en mode test, rien ne part : le SMS s'affiche dans le terminal du backend).

| Événement | Destinataire | Message (préfixe « TerangaCycle : ») |
|---|---|---|
| Signalement validé | citoyen (compte connecté) | « votre signalement TC-… est validé. Une mission de collecte est créée. Merci ! » |
| Signalement rejeté | citoyen | « … n'a pas été retenu. Motif : … » |
| Preuve vérifiée | citoyen | « le dépôt TC-… a été collecté : 23,5 kg vérifiés. Merci pour votre signalement ! » |
| Nouvelle mission | collecteurs vérifiés et actifs **de l'organisation** du dépôt | « nouvelle mission (plastique), dépôt TC-… » |
| Preuve vérifiée, refusée, contestée | collecteur | kilos comptés, motif du refus, examen en cours |
| Mission retirée ou annulée par un admin | collecteur | « … vous a été retirée / est annulée. Motif : … » |

- Le SMS est enregistré dans la même transaction que l'action (une action refusée n'envoie rien), puis envoyé juste après la réponse. Un échec du fournisseur ne fait jamais échouer l'action : le SMS reste « en échec » et `flask --app run send-notifications` le relance (3 essais).
- Pas de SMS pour un compte sans numéro (comptes de démo, signalement anonyme) ni pour qui a coupé ses SMS : la ligne apparaît « non envoyée » (`no_phone`, `opted_out`) dans le journal.

| Méthode | Route | Accès | Réponse |
|---|---|---|---|
| GET | `/api/notifications` | 🛡️ (son organisation) · super admin (tout) | `{ success, provider, notifications: [{ kind, kind_label, recipient, recipient_role, phone, message, status, detail, attempts, tracking_number, created_at, sent_at }] }` |

`phone` est toujours masqué (`+221 77 *** ** 01`). `status` : `pending`, `sent`, `failed`, `skipped`. Filtre : `?status=`.

### Photos

| Méthode | Route | Accès |
|---|---|---|
| GET | `/api/uploads/<chemin>` | 🌐 (photos `reports/`, `proofs/`, notes vocales `voices/` avec le bon type audio) |

## 5. Exemple : la boucle complète en `curl`

```bash
API=http://localhost:5000/api
ADMIN=$(curl -s -X POST $API/auth/demo -H 'Content-Type: application/json' -d '{"login":"admin-demo"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
COLL=$(curl -s -X POST $API/auth/demo -H 'Content-Type: application/json' -d '{"login":"collecteur-demo"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])")

curl -s -X POST $API/reports -F photo=@depot.jpg -F latitude=14.7167 -F longitude=-17.4677 -F comment="Près de la route"
curl -s -X PATCH $API/reports/1/moderate -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"action":"approve","final_category":"plastic"}'
curl -s -X POST $API/missions/1/accept -H "Authorization: Bearer $COLL"
curl -s -X POST $API/missions/1/proof -H "Authorization: Bearer $COLL" -F photo=@apres.jpg -F weight_kg=23.5
curl -s -X PATCH $API/proofs/1/verify -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"decision":"verified"}'
curl -s $API/dashboard/stats -H "Authorization: Bearer $ADMIN"
```
