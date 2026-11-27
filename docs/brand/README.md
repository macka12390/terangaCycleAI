# Logo TerangaCycle AI

Un **repère de carte** (je signale un dépôt ici) dont la tête porte une **boucle de recyclage** (la matière repart dans le cycle) : le parcours de l'application en un seul signe.

| Fichier | Usage |
|---|---|
| `logo.svg` | Logo principal, carré arrondi (documents, présentations, réseaux) |
| `logo-512.png` | Le même en image, fond transparent autour des coins |
| `mark.svg` | Repère seul, sans fond (sur un fond déjà vert ou blanc) |
| `logo-square.svg` | Plein cadre, source des icônes de l'appli |
| `logo-maskable.svg` | Motif réduit pour Android, qui rogne l'icône en cercle |

Dans l'application : composant `web/src/ui/Logo.tsx` ; icônes `web/public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` et `favicon.svg`.

## Couleurs

| Nom | Code | Rôle |
|---|---|---|
| Vert profond | `#0B3D2E` | fond |
| Vert | `#187A50` | repère, flèche verte |
| Jaune | `#F2B705` | flèche jaune, « AI » |
| Menthe | `#EAF3EC` | disque central |

Nom écrit à côté du logo : **TerangaCycle** en gras, suivi de **AI** dans une pastille jaune.

## Régénérer

Après une modification du dessin dans `make_logo.py` :

```powershell
api\.venv\Scripts\python.exe docs\brand\make_logo.py
```

Le script réécrit les SVG de ce dossier et les icônes PNG de `web/public/` (Pillow). Reporter aussi le dessin dans `web/src/ui/Logo.tsx`.
