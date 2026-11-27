"""Télécharge UNE FOIS les poids CLIP (openai/clip-vit-base-patch32, licence MIT, ~600 Mo).

Ensuite, tout tourne hors ligne : le backend lit le dossier local avec local_files_only=True.

    python scripts/download_model.py [--dest instance/models/clip-vit-base-patch32]
"""

import argparse
from pathlib import Path

REPO_ID = "openai/clip-vit-base-patch32"
DEFAULT_DEST = Path(__file__).resolve().parent.parent / "instance" / "models" / "clip-vit-base-patch32"
# Seuls les fichiers utiles à PyTorch (pas les poids TensorFlow ni Flax). Le dépôt ne publie
# pas de model.safetensors : on récupère pytorch_model.bin puis on le convertit localement.
ALLOW = ["*.json", "*.txt", "model.safetensors", "pytorch_model.bin"]


def convert_to_safetensors(dest: Path) -> None:
    """Convertit pytorch_model.bin en model.safetensors (format sans exécution de code)."""
    bin_path = dest / "pytorch_model.bin"
    st_path = dest / "model.safetensors"
    if st_path.is_file() or not bin_path.is_file():
        return
    import torch
    from safetensors.torch import save_file

    # weights_only=True : désérialise uniquement des tenseurs, jamais de code arbitraire.
    state = torch.load(bin_path, map_location="cpu", weights_only=True)
    # safetensors refuse les tenseurs qui partagent leur mémoire : on les copie.
    state = {name: tensor.contiguous().clone() for name, tensor in state.items()}
    save_file(state, str(st_path), metadata={"format": "pt"})
    bin_path.unlink()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST)
    args = parser.parse_args()
    from huggingface_hub import snapshot_download

    args.dest.mkdir(parents=True, exist_ok=True)
    path = snapshot_download(repo_id=REPO_ID, local_dir=args.dest, allow_patterns=ALLOW)
    convert_to_safetensors(args.dest)
    print(f"Modèle prêt dans {path}. Relancez le backend : /api/health doit indiquer ai_mode=prototype.")


if __name__ == "__main__":
    main()
