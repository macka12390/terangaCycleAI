"""Classification des déchets : interface commune et implémentations interchangeables.

- `manual`    : aucune IA active, le citoyen ou l'admin choisit (jamais présenté comme IA) ;
- `prototype` : classificateur expérimental (CLIP zéro-shot, local, non évalué sur des
                photos sénégalaises) ;
- `model`     : modèle entraîné et évalué (à brancher après le hackathon).
"""
