"""Mesure le classificateur CLIP zéro-shot sur de vraies photos rangées par catégorie.

Arborescence attendue (une sous-dossier par catégorie, noms = CATEGORIES) :

    ml/data/eval/plastic/*.jpg
    ml/data/eval/metal/*.jpg
    ml/data/eval/paper/*.jpg
    ml/data/eval/glass/*.jpg
    ml/data/eval/organic/*.jpg

    python scripts/evaluate_model.py [--data ../ml/data/eval] [--details]

Affiche la précision globale, le rappel par catégorie et la matrice de confusion.
Avec peu de photos, ces chiffres donnent une tendance, pas une mesure fiable.
"""

import argparse
import sys
from collections import Counter, defaultdict
from pathlib import Path

API_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(API_DIR))

from PIL import Image  # noqa: E402

from app.ai.clip_zero_shot import ClipZeroShotClassifier  # noqa: E402
from app.constants import CATEGORIES  # noqa: E402

DEFAULT_DATA = API_DIR.parent / "ml" / "data" / "eval"
DEFAULT_MODEL = API_DIR / "instance" / "models" / "clip-vit-base-patch32"
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--details", action="store_true", help="affiche chaque photo")
    args = parser.parse_args()

    samples = [
        (category, path)
        for category in CATEGORIES
        for path in sorted((args.data / category).glob("*"))
        if path.suffix.lower() in EXTENSIONS
    ]
    if not samples:
        sys.exit(f"Aucune photo trouvée dans {args.data}/<catégorie>/ ({', '.join(CATEGORIES)}).")

    classifier = ClipZeroShotClassifier(str(args.model))
    confusion: dict[str, Counter] = defaultdict(Counter)
    confidences = {True: [], False: []}

    for expected, path in samples:
        with Image.open(path) as image:
            prediction = classifier.classify(image)
        ok = prediction.category == expected
        confusion[expected][prediction.category] += 1
        confidences[ok].append(prediction.confidence)
        if args.details:
            mark = "OK " if ok else "ERR"
            print(f"{mark} {expected:>8} -> {prediction.category:<8} "
                  f"{prediction.confidence:.2f}  {path.name}")

    total = len(samples)
    correct = sum(confusion[c][c] for c in CATEGORIES)
    print(f"\nPhotos : {total}   Correctes : {correct}   Précision globale : {correct / total:.0%}\n")

    width = max(len(c) for c in CATEGORIES)
    print("Rappel par catégorie :")
    for category in CATEGORIES:
        n = sum(confusion[category].values())
        if n:
            print(f"  {category:>{width}} : {confusion[category][category]}/{n} "
                  f"({confusion[category][category] / n:.0%})")

    print("\nMatrice de confusion (lignes = attendu, colonnes = prédit) :")
    print(" " * (width + 2) + " ".join(f"{c[:7]:>7}" for c in CATEGORIES))
    for category in CATEGORIES:
        row = " ".join(f"{confusion[category][p]:>7}" for p in CATEGORIES)
        print(f"  {category:>{width}}{row}")

    for ok, label in ((True, "correctes"), (False, "erronées")):
        values = confidences[ok]
        if values:
            print(f"\nConfiance moyenne des prédictions {label} : {sum(values) / len(values):.2f}",
                  end="")
    print()


if __name__ == "__main__":
    main()
