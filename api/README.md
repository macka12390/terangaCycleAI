# Backend Flask — TerangaCycle AI (MVP hackathon)

API REST du MVP : signalement → classification IA → modération → mission → preuve → kilos vérifiés → statistiques.
Le contrat partagé avec le frontend est dans [`../docs/api-contract.md`](../docs/api-contract.md).

## Lancer

Windows, PowerShell, depuis `api/` :

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
python run.py
```

Vérifier : <http://localhost:5000/api/health>. La base SQLite (`instance/terangacycle.db`) et les comptes de démo sont créés au premier démarrage.

| Commande | Effet |
|---|---|
| `python run.py` | Serveur sur `127.0.0.1:5000` (variables `HOST`, `PORT`, `FLASK_DEBUG`) |
| `flask --app run seed-demo` | 10 signalements de démo à Dakar, tous statuts, marqués `is_demo` |
| `flask --app run clear-demo` | Retire les données de démo et leurs photos |
| `flask --app run reset-db` | Efface toute la base locale et les photos (demande confirmation) |
| `python -m pytest` | Tests (boucle complète + règles métier) |

Tester depuis un téléphone sur le même Wi-Fi : `HOST=0.0.0.0` dans `.env` (copier `.env.example`). Attention : le navigateur ne donne la position GPS qu'en **HTTPS** ou sur `localhost` (voir Risques).

## Architecture

```
api/
├── run.py                 point d'entrée (charge .env, crée l'app)
├── requirements*.txt      exécution / tests / IA facultative
├── scripts/download_model.py   téléchargement unique des poids CLIP
├── app/
│   ├── __init__.py        create_app() : config, SQLite, CORS, erreurs, routes, IA
│   ├── config.py          configuration lue dans l'environnement
│   ├── constants.py       catégories, rôles, statuts et libellés
│   ├── models/            User, Report, Mission, CollectionProof, StatusEvent
│   ├── routes/            un blueprint par ressource (couche HTTP mince)
│   ├── services/          règles métier : reports, missions, proofs, stats, auth, events
│   ├── ai/                interface Classifier, mode manuel, CLIP zéro-shot, cache
│   ├── utils/             erreurs JSON, validation, photos (EXIF retiré), dates
│   ├── serializers.py     objets → JSON du contrat
│   ├── seed.py, cli.py    données de démo, commandes flask
└── tests/                 pytest (base et dossier photos temporaires)
```

Les routes ne contiennent aucune règle : elles lisent la requête, appellent un service et renvoient le JSON. Toutes les règles sont dans `services/`, donc vérifiées côté serveur.

### Données

| Table | Rôle |
|---|---|
| `users` | Comptes de démo (`role` : citizen, admin, collector ; `is_verified`) |
| `reports` | Signalement : photo, GPS, commentaire, proposition IA (`ai_mode`, `ai_category`, `ai_confidence`), `citizen_category`, `final_category` (décision humaine), statut |
| `missions` | Une par signalement validé (`report_id` unique), collecteur, dates |
| `collection_proofs` | Photo après, poids, statut de vérification ; une seule preuve non rejetée par mission (index unique partiel) |
| `status_events` | Journal de chaque décision et changement de statut (frise de suivi, activité récente) |

Contraintes `CHECK` en base : statuts et catégories valides, poids > 0, coordonnées dans les bornes, collecteur obligatoire pour une mission acceptée.

### Règles métier garanties par le backend

1. Numéro de suivi unique, aléatoire et dictable (`TC-2026-7KQ4MX`).
2. Seul un signalement `pending` peut être validé ou rejeté, une seule fois. Un rejeté ne devient jamais une mission.
3. Collecteur non vérifié → 403 `COLLECTOR_NOT_VERIFIED`.
4. Acceptation atomique (`UPDATE … WHERE status='available'`) : une mission n'a qu'un collecteur.
5. Preuve : mission acceptée par ce collecteur, photo obligatoire, poids > 0 et ≤ 10 000 kg.
6. Kilos comptés **uniquement** pour les preuves `verified` ; rejetée ou contestée = 0 kg.
7. L'IA propose, l'humain décide : `final_category` est toujours posée par l'admin ; sous 60 % de confiance, rien n'est présélectionné.
8. Photos contrôlées (type réel via Pillow, 8 Mo max, taille en pixels bornée), ré-encodées sans EXIF.
9. Aucun GPS ni donnée personnelle dans les journaux ; clé secrète et base hors Git (`instance/`).
10. Envoi idempotent avec `client_uuid` (renvoi hors ligne sans doublon).

## IA

| Mode | Quand | Présentation |
|---|---|---|
| `manual` | Par défaut, sans dépendances IA | « Classification manuelle : aucun modèle IA n'est actif » |
| `prototype` | CLIP zéro-shot installé localement | « Suggestion d'un classificateur IA expérimental » |
| `model` | Modèle entraîné et évalué (après le hackathon) | « Prédiction du modèle IA (évalué) » |

Activer le prototype (≈ 200 Mo de PyTorch CPU + ≈ 600 Mo de poids, une seule fois ; ensuite tout tourne hors ligne) :

```powershell
pip install -r requirements-ai.txt
python scripts/download_model.py
python run.py   # /api/health doit indiquer ai_mode=prototype
```

`AI_BACKEND=manual` force le mode manuel. Une panne du modèle retombe sur le mode manuel, jamais sur une prédiction inventée. Les statistiques d'IA (`stats.ai`) ne comptent que les modes `model` et `prototype`.

## Risques du MVP

| Risque | Parade |
|---|---|
| GPS bloqué sur téléphone en `http://192.168.x.x` (contexte non sécurisé) | Servir le frontend en HTTPS (plugin Vite `basicSsl`, ou tunnel) ; le proxy Vite garde une seule origine |
| Modèle IA trop lourd ou peu fiable sur les photos de Dakar | Mode `prototype` affiché comme tel ; mode manuel par défaut ; correction humaine obligatoire |
| Wi-Fi du jury instable | Tout est local (SQLite, photos, IA) ; préparer `seed-demo` et une vidéo de secours |
| Photos lourdes ou HEIC (iPhone) | Compression côté frontend en JPEG (canvas) ; le backend refuse proprement (415) |
| SQLite et écritures concurrentes | Suffisant pour une démo ; transitions atomiques ; migration PostgreSQL ensuite |
| Démo comptée comme donnée réelle | `is_demo` sur chaque objet, `include_demo=false` dans les stats |

## Ordre d'implémentation

| Étape | Contenu | État |
|---|---|---|
| H00–H01 | Contrat d'API, squelette Flask, modèles | ✅ |
| H01–H09 | Signalements, photos, auth démo, modération | ✅ |
| H09–H13 | Missions, acceptation exclusive, preuves, interface IA | ✅ |
| H13–H16 | Vérification des preuves, statistiques, données de démo, tests de bout en bout | ✅ |
| H16–H19 | IA prototype (CLIP) installée et testée sur de vraies photos | à faire |
| H16–H19 | Intégration avec le frontend, carte (Leaflet), file hors ligne côté web | à faire (frontend) |
| H19–H22 | Tests sur téléphone, corrections | à faire |
