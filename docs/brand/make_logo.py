"""Logo TerangaCycle AI (proposition A, « repère + boucle ») : génère les fichiers SVG.

Un repère de carte (je signale ici) dont la tête porte une boucle de recyclage (la matière
repart dans le cycle). Couleurs : jetons de web/src/theme/theme.css.

    python docs/brand/make_logo.py

Produit dans docs/brand/ : logo.svg (carré arrondi), logo-square.svg (plein cadre, pour les
icônes PNG), logo-maskable.svg (motif réduit dans la zone de sécurité Android) et
mark.svg (repère seul, fond transparent), puis les icônes PNG de web/public/ (Pillow,
dessinées avec la même géométrie, suréchantillonnées pour des bords lisses).
"""

import math
from pathlib import Path

OUT = Path(__file__).resolve().parent
DARK, GREEN, ACCENT, MINT = "#0B3D2E", "#187A50", "#F2B705", "#EAF3EC"


def _pt(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + r * math.sin(a)


def _arc_arrow(cx, cy, r, start, end, width, color):
    head_len = width * 1.9
    end_arc = end - math.degrees(head_len * 0.55 / r)
    x1, y1 = _pt(cx, cy, r, start)
    x2, y2 = _pt(cx, cy, r, end_arc)
    t = math.radians(end_arc)
    tx, ty, nx, ny = -math.sin(t), math.cos(t), math.cos(t), math.sin(t)
    tip = (x2 + tx * head_len, y2 + ty * head_len)
    left = (x2 + nx * width * 1.15, y2 + ny * width * 1.15)
    right = (x2 - nx * width * 1.15, y2 - ny * width * 1.15)
    return (
        f'<path d="M{x1:.1f} {y1:.1f} A{r} {r} 0 0 1 {x2:.1f} {y2:.1f}" fill="none" '
        f'stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>'
        f'<path d="M{tip[0]:.1f} {tip[1]:.1f} L{left[0]:.1f} {left[1]:.1f} L{right[0]:.1f} {right[1]:.1f} Z" '
        f'fill="{color}" stroke="{color}" stroke-width="{width * 0.25:.1f}" stroke-linejoin="round"/>'
    )


def _pin_path(cx, cy, r, tip_y):
    alpha = math.degrees(math.acos(r / (tip_y - cy)))
    x1, y1 = _pt(cx, cy, r, 90 - alpha)
    x2, y2 = _pt(cx, cy, r, 90 + alpha)
    return f"M{cx} {tip_y} L{x2:.1f} {y2:.1f} A{r} {r} 0 1 1 {x1:.1f} {y1:.1f} Z"


def mark() -> str:
    """Le repère et sa boucle, dans un repère 512 × 512."""
    return (
        f'<path d="{_pin_path(256, 214, 150, 468)}" fill="{GREEN}"/>'
        f'<circle cx="256" cy="214" r="104" fill="{MINT}"/>'
        + _arc_arrow(256, 214, 66, 200, 330, 22, ACCENT)
        + _arc_arrow(256, 214, 66, 20, 150, 22, GREEN)
    )


def svg(content: str, size: int | None = None) -> str:
    dims = f' width="{size}" height="{size}"' if size else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"{dims}>{content}</svg>\n'


def main() -> None:
    files = {
        "logo.svg": svg(f'<rect width="512" height="512" rx="112" fill="{DARK}"/>{mark()}'),
        "logo-square.svg": svg(f'<rect width="512" height="512" fill="{DARK}"/>{mark()}'),
        # Android rogne l'icône maskable en cercle : motif réduit à 72 %, centré.
        "logo-maskable.svg": svg(
            f'<rect width="512" height="512" fill="{DARK}"/>'
            f'<g transform="translate(256 256) scale(0.72) translate(-256 -266)">{mark()}</g>'
        ),
        "mark.svg": svg(mark()),
    }
    for name, content in files.items():
        (OUT / name).write_text(content, encoding="utf-8")

    public = OUT.parent.parent / "web" / "public"
    for name, size, variant in (
        ("icon-192.png", 192, "square"),
        ("icon-512.png", 512, "square"),
        ("icon-maskable-512.png", 512, "maskable"),
        ("apple-touch-icon.png", 180, "square"),
    ):
        render_png(public / name, size, variant)
    render_png(OUT / "logo-512.png", 512, "rounded")


def render_png(path: Path, size: int, variant: str) -> None:
    """Icône PNG sans navigateur : même dessin que mark(), à 4× puis réduit."""
    from PIL import Image, ImageDraw

    big = 2048
    k = big / 512
    shrink, shift = (0.72, 10) if variant == "maskable" else (1.0, 0)

    def p(x, y):
        return ((256 + shrink * (x - 256)) * k, (256 + shrink * (y + shift - 256)) * k)

    def hex_rgb(color):
        return tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))

    image = Image.new("RGB", (big, big), hex_rgb(DARK))
    draw = ImageDraw.Draw(image)
    if variant == "rounded":
        image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=112 * k, fill=hex_rgb(DARK))

    # Repère : pointe, puis le grand arc de cercle.
    cx, cy, r, tip_y = 256, 214, 150, 468
    alpha = math.degrees(math.acos(r / (tip_y - cy)))
    points = [p(cx, tip_y)]
    start, end = 90 + alpha, 450 - alpha
    for i in range(241):
        x, y = _pt(cx, cy, r, start + (end - start) * i / 240)
        points.append(p(x, y))
    draw.polygon(points, fill=hex_rgb(GREEN))
    rr = 104 * shrink * k
    ccx, ccy = p(cx, cy)
    draw.ellipse((ccx - rr, ccy - rr, ccx + rr, ccy + rr), fill=hex_rgb(MINT))

    def arc_arrow(start, end, color, radius=66, width=22):
        head_len = width * 1.9
        end_arc = end - math.degrees(head_len * 0.55 / radius)
        half = width / 2 * shrink * k
        for i in range(400):
            x, y = _pt(cx, cy, radius, start + (end_arc - start) * i / 399)
            px, py = p(x, y)
            draw.ellipse((px - half, py - half, px + half, py + half), fill=hex_rgb(color))
        x2, y2 = _pt(cx, cy, radius, end_arc)
        t = math.radians(end_arc)
        tx, ty, nx, ny = -math.sin(t), math.cos(t), math.cos(t), math.sin(t)
        tri = [
            (x2 + tx * head_len, y2 + ty * head_len),
            (x2 + nx * width * 1.15, y2 + ny * width * 1.15),
            (x2 - nx * width * 1.15, y2 - ny * width * 1.15),
        ]
        draw.polygon([p(x, y) for x, y in tri], fill=hex_rgb(color))

    arc_arrow(200, 330, ACCENT)
    arc_arrow(20, 150, GREEN)
    image.resize((size, size), Image.LANCZOS).save(path, optimize=True)


if __name__ == "__main__":
    main()
