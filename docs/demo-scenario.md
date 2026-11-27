# Scénario de démonstration — TerangaCycle AI

Démo de 3 à 4 minutes, sur un ordinateur (console admin) et un téléphone (citoyen, collecteur).
Message à faire passer : **un dépôt signalé devient des kilos vérifiés, et chaque étape est tracée**.

## 1. Préparer la machine (la veille, puis 30 min avant)

Backend (PowerShell, dans `api/`) :

```powershell
.\.venv\Scripts\Activate.ps1
flask --app run reset-db --yes      # base propre
flask --app run seed-demo           # 10 signalements de démo à Dakar (badge « Démo »)
python run.py                       # http://localhost:5000/api/health → "ai_mode": "prototype"
```

Vérifier dans `/api/health` que `ai_mode` vaut **`prototype`** : sinon l'IA est en mode manuel (`ai_status` donne la raison).

Frontend, dans `web/` :

- sur l'ordinateur seul : `npm run dev`, puis <http://localhost:5173> ;
- avec un téléphone : `npm run dev:mobile` (HTTPS auto-signé + réseau local). Ouvrir sur le téléphone l'adresse **`https://<IP-du-PC>:5173`** affichée par Vite, accepter l'avertissement de certificat, puis autoriser la localisation. Au premier lancement, Windows demande d'autoriser Node.js sur le réseau : choisir **réseau privé**.

Le backend reste sur `127.0.0.1` : le téléphone ne parle qu'à Vite, qui relaie `/api` vers Flask.

**Photos de démo** (sur l'ordinateur, hors Git) : `ml/data/demo/`, à copier sur le téléphone. Licences libres, sources dans `ml/data/demo/SOURCES.json`.

| Fichier | Ce que montre l'IA |
|---|---|
| `1-plastique-sur.jpg` | Plastique, confiance ≈ 100 % → présélectionné |
| `2-plastique-hesitant.jpg` | Plastique, confiance ≈ 56 % → **rien n'est présélectionné**, l'humain choisit |
| `3-metal.jpg` | Métal ≈ 98 % |
| `4-carton.jpg` | Papier et carton ≈ 99 % |
| `5-organique.jpg` | Organique ≈ 100 % |

Pour la photo « après collecte », prendre une vraie photo d'un sol propre le jour même.

## 2. Déroulé

| # | Qui (écran) | Action | Ce que le jury voit |
|---|---|---|---|
| 1 | Citoyen (téléphone) | Signaler un dépôt avec `1-plastique-sur.jpg` | Photo + GPS ; l'IA propose « Plastique », mention **prototype** |
| 2 | Citoyen | Envoyer | Numéro de suivi `TC-2026-…` |
| 3 | Admin (PC) | Modération → valider le signalement | Mission créée |
| 4 | Admin | Modération → **rejeter** le signalement de démo « Liberté 6 », motif « Photo non exploitable » | Un rejet ne devient jamais une mission |
| 5 | Collecteur non vérifié (téléphone) | Tenter d'accepter la mission | Refus clair : compte non vérifié |
| 6 | Collecteur vérifié | Accepter, puis envoyer la preuve (photo après + poids, ex. 23,5 kg) | Mission terminée, kilos **pas encore comptés** |
| 7 | Admin | Preuves → vérifier | Tableau de bord : les kilos apparaissent dans « Plastique » ; frise et carte à jour |
| 8 | Citoyen | Ouvrir le suivi du numéro | « Terminé — kilos vérifiés » |

Variante si le temps le permet : signaler `2-plastique-hesitant.jpg` pour montrer que sous 60 % de confiance, l'IA ne décide rien à la place de l'humain.

Pour basculer de rôle : accueil → **Espaces de démonstration** → choisir le compte.

## 3. Chiffres à citer

- IA locale (CLIP, aucune API étrangère) : **87 %** de bonnes réponses sur 55 photos libres de 5 matières (`scripts/evaluate_model.py`). Peu de photos : c'est une tendance, pas une mesure définitive ; prochaine étape, des photos de dépôts à Dakar.
- Quand l'IA se trompe, sa confiance moyenne est de 0,58, donc sous le seuil de 60 % : elle ne présélectionne pas.
- Boucle testée de bout en bout : un signalement devient des kilos vérifiés en **3 minutes**.

## 4. Plan B

| Problème | Parade |
|---|---|
| Wi-Fi du lieu instable | Tout est local (base, photos, IA) : utiliser le partage de connexion du téléphone, ou tout faire sur le PC |
| Téléphone refuse le GPS | Faire le signalement depuis le PC (`localhost` autorise la position) |
| IA en mode manuel | Montrer le choix manuel, clairement indiqué ; expliquer le mode prototype avec les chiffres ci-dessus |
| Panne complète | Vidéo de la démo enregistrée la veille |
| Mission acceptée par erreur | Admin → Missions : **libérer** (`/release`) ou **annuler** (`/cancel`) |
