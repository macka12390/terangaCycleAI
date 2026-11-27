# TerangaCycle AI

**Transformer un déchet signalé par un citoyen en ressource tracée, classée par IA et confiée au bon collecteur ou recycleur local, avec des données hébergées et gouvernées au Sénégal.**

Projet présenté au hackathon **« Afrique Makers : l'innovation au service d'une souveraineté technologique durable et inclusive »**.

> 🚧 Projet en cours de construction : la documentation est en place, le code source arrive au fur et à mesure.

---

## Le problème

À Dakar comme dans beaucoup de villes, les dépôts sauvages sont signalés de manière informelle (appels, réseaux sociaux), sans géolocalisation fiable ni suivi. Les récupérateurs informels et les petits recycleurs n'ont aucun outil pour savoir où se trouve la matière valorisable, et les communes manquent de données pour planifier les tournées.

## La solution

Une application web progressive (PWA), utilisable hors-ligne, qui relie citoyens, collecteurs, recycleurs et communes :

```
Signaler → Classifier (IA) → Dispatcher → Collecter → Valoriser → Mesurer l'impact
```

1. **Le citoyen** prend une photo du dépôt : la position GPS est captée automatiquement et un modèle d'IA embarqué propose le type de déchet (plastique, métal, verre, organique, mixte), même sans réseau.
2. **Le collecteur** voit les missions proches, en accepte une, puis prouve la collecte par photo et poids.
3. **Le recycleur** consulte les lots de matière disponibles par type et par zone.
4. **La commune** pilote avec une carte de chaleur, des indicateurs (kg valorisés, délais) et des exports ouverts.

Le cœur du projet n'est pas le signalement mais **la valorisation** : le matching entre déchet, collecteur et recycleur.

## Souveraine, durable, inclusive

| | Ce que fait TerangaCycle AI |
|---|---|
| **Souveraineté** | Modèle IA open source (MobileNetV3 → ONNX) exécuté sur le téléphone ou un serveur local, aucune API d'IA étrangère, données exportables, plan de sortie vers un hébergeur local |
| **Durable** | Économie circulaire : chaque déchet devient une matière tracée, avec des indicateurs d'impact mesurés |
| **Inclusive** | Français et wolof, mode hors-ligne, pictogrammes, canal SMS/WhatsApp, récupérateurs informels intégrés comme acteurs rémunérés |

## Stack technique (MVP hackathon 24 h)

| Couche | Technologies |
|---|---|
| Frontend | React + Vite, React Router, Tailwind CSS, Lucide (dossier `web/`) |
| Backend | Python 3.12, Flask, Flask-SQLAlchemy, SQLite (dossier `api/`) |
| IA | Classification locale (CLIP zéro-shot, mode « prototype »), mode manuel si aucun modèle n'est installé ; aucune API d'IA étrangère |
| Photos | Stockage local, ré-encodage JPEG sans métadonnées EXIF |

Pas de Docker pour le MVP : deux commandes suffisent pour lancer le projet.

## Démarrer en local

**Backend** (Windows, PowerShell, dans `api/`) — détails dans [`api/README.md`](api/README.md) :

```powershell
cd api
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
flask --app run seed-demo      # facultatif : données de démo marquées « Démo »
python run.py                  # http://localhost:5000/api/health
```

**Frontend** (dans `web/`) : `npm install` puis `npm run dev` (http://localhost:5173), avec un proxy Vite `/api → http://localhost:5000`.

Le contrat entre les deux est dans [`docs/api-contract.md`](docs/api-contract.md).

## Documentation

| Document | Contenu |
|---|---|
| [🔌 Contrat d'API](docs/api-contract.md) | Routes `/api/*`, formats JSON, statuts, codes d'erreur : la référence partagée frontend / backend |
| [⚙️ Backend Flask](api/README.md) | Architecture, installation, commandes, tests, IA, risques |
| [📋 Cahier des charges](docs/cahier-des-charges.md) | Vision, acteurs, user stories, exigences, planning, risques, pitch (version initiale) |
| [🛠️ Dossier technique](docs/dossier-technique.md) | Architecture cible d'origine (FastAPI, PostGIS) — remplacée pour le hackathon par Flask + SQLite |

## Organisation du dépôt

```
terangacycle-ai/
├── api/       Backend Flask + SQLite + service IA (MVP)
├── web/       Frontend React
├── ml/        Modèle IA (réservé à l'après-hackathon)
├── scripts/   Contrôles d'hygiène du dépôt (scripts/ci/)
├── security/  Exceptions d'audit datées
└── docs/      Contrat d'API, cahier des charges, dossier technique
```

## Feuille de route

- [x] Cahier des charges et dossier technique
- [x] Backend Flask : boucle signalement → validation → mission → preuve → kilos vérifiés
- [ ] Jeu de photos locales étiqueté et modèle de base évalué
- [ ] MVP : signalement, classification, carte, missions, tableau de bord, hors-ligne
- [ ] Pilote terrain dans un quartier

## Équipe

Projet porté par une équipe de trois personnes : développement fullstack, données et IA, design et pitch.

## Licence

**Licence :** [GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`). Pour signaler une vulnérabilité, voir [SECURITY.md](SECURITY.md).
