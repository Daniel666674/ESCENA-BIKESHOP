#!/usr/bin/env python3
"""Replace a product photo's background with a clean white studio background.

Pipeline:
  1. rembg (U^2-Net) does the heavy lifting — a real neural segmentation model
     that separates the product from its background, cast shadows and all.
  2. A refinement pass cleans up what rembg leaves behind: it keeps only the
     product's own connected region (dropping detached shadow blobs), lets the
     soft anti-aliased edge live only in a thin band around the solid object,
     and runs an alpha contrast curve so the faint gray halo of a cast shadow
     disappears instead of smearing onto the white.
  3. Composites the result onto pure white at the original resolution.

Usage:
    python3 tools/replace_background.py assets/img/products/cana-shadow-ravage-topload.jpg
    python3 tools/replace_background.py assets/img/products/cana-shadow-ravage-topload*.jpg

Writes each result next to its source as <name>-whitebg.jpg (never overwrites
the original) so every image can be reviewed before it goes live.

Requirements:
    pip install rembg onnxruntime opencv-python-headless pillow numpy
The first run downloads the ~4.5 MB U^2-Net-lite weights automatically (set
REMBG_MODEL to use a different rembg model, e.g. "isnet-general-use" for the
highest quality at ~170 MB).
"""
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from rembg import new_session, remove

MODEL = os.environ.get("REMBG_MODEL", "u2netp")
_SESSION = new_session(MODEL)


def cutout_alpha(src_path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Run rembg and return (rgb, alpha[0..1]) at the original resolution."""
    img = Image.open(src_path).convert("RGBA")
    cut = remove(
        img,
        session=_SESSION,
        alpha_matting=True,
        alpha_matting_foreground_threshold=250,
        alpha_matting_background_threshold=20,
        alpha_matting_erode_size=15,
    )
    arr = np.array(cut)
    return arr[:, :, :3].astype(np.float32), arr[:, :, 3].astype(np.float32) / 255.0


def refine_alpha(alpha: np.ndarray) -> np.ndarray:
    """Keep the product's own region, drop shadow ghosts, crisp up the edge."""
    # High-confidence core: solid product only. A cast shadow is soft/gray, so
    # it never clears this threshold and is excluded from the start.
    core = (alpha > 0.65).astype(np.uint8)
    core = cv2.morphologyEx(
        core, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    )

    # Keep only the largest connected component (removes any detached blob such
    # as a shadow the model half-kept off to the side).
    num, labels, stats, _ = cv2.connectedComponentsWithStats(core, connectivity=8)
    if num > 1:
        biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        keep = (labels == biggest).astype(np.uint8)
    else:
        keep = core

    # Close interior gaps so bolt holes / highlights inside the part stay solid.
    keep = cv2.morphologyEx(
        keep, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    )

    # Let the soft edge live only in a thin band around the core — not far
    # enough to reach an adjacent cast shadow.
    band = cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    alpha_band = alpha * band

    # Steep contrast curve: mid/low alphas (gray shadow) collapse to 0, high
    # alphas snap to 1. Then guarantee the core is fully opaque and feather the
    # boundary by <1px for a clean anti-aliased edge.
    a = np.clip((alpha_band - 0.35) / (0.75 - 0.35), 0, 1)
    a = np.maximum(a, keep.astype(np.float32))
    a = cv2.GaussianBlur(a, (0, 0), 0.8)
    return np.clip(a, 0, 1)


def replace_background(src_path: Path, dst_path: Path) -> None:
    rgb, alpha = cutout_alpha(src_path)
    a = refine_alpha(alpha)[:, :, None]
    white = np.full_like(rgb, 255.0)
    comp = (rgb * a + white * (1 - a)).astype(np.uint8)
    cv2.imwrite(str(dst_path), cv2.cvtColor(comp, cv2.COLOR_RGB2BGR),
                [cv2.IMWRITE_JPEG_QUALITY, 92])


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)

    for a in args:
        src_path = Path(a)
        if not src_path.is_file():
            print(f"Skip (not found): {src_path}")
            continue
        if src_path.stem.endswith("-whitebg"):
            continue  # don't reprocess our own output
        dst_path = src_path.with_name(src_path.stem + "-whitebg" + src_path.suffix)
        replace_background(src_path, dst_path)
        print(f"Wrote {dst_path}")


if __name__ == "__main__":
    main()
