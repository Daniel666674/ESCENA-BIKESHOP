#!/usr/bin/env python3
"""Replace a product photo's background with a clean white studio background.

Pipeline:
  1. rembg (U^2-Net) produces a coarse foreground mask — a real neural
     segmentation model that separates the product from its background,
     shadows included. The lite model outputs a low-res (320px) mask, so its
     raw edges are soft and blobby.
  2. A guided filter snaps that soft mask onto the product's true edges at full
     resolution, using the original photo as the guide. This is what makes the
     outline crisp instead of a fuzzy halo.
  3. Cleanup: keep only the product's own connected region (drops detached
     shadow blobs), then erode the matte inward a couple of pixels to remove
     the thin dark rim where a shadowed edge blends into a dark background
     (edge decontamination).
  4. Composite onto pure white at the original resolution.

Usage:
    python3 tools/replace_background.py assets/img/products/cana-shadow-ravage-topload.jpg
    python3 tools/replace_background.py assets/img/products/cana-shadow-ravage-topload*.jpg

Writes each result next to its source as <name>-whitebg.jpg (never overwrites
the original) so every image can be reviewed before it goes live.

Requirements:
    pip install rembg onnxruntime opencv-contrib-python-headless pillow numpy
The first run downloads the ~4.5 MB U^2-Net-lite weights automatically. Set
REMBG_MODEL to use a heavier model (e.g. "isnet-general-use", ~170 MB, sharper
edges) if it's available on the machine.

Tunables (env vars):
    ERODE_PX   inward decontamination erosion, default 3 (raise if a dark
               fringe survives, lower if fine features get eaten)
    GF_RADIUS  guided-filter radius, default 16
"""
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from rembg import new_session, remove

MODEL = os.environ.get("REMBG_MODEL", "u2netp")
ERODE_PX = int(os.environ.get("ERODE_PX", "3"))
GF_RADIUS = int(os.environ.get("GF_RADIUS", "16"))
_SESSION = new_session(MODEL)


def _odd(n: int) -> int:
    return n if n % 2 else n + 1


def raw_mask(img_rgb: np.ndarray) -> np.ndarray:
    """rembg foreground mask, [0..1], full resolution (but low-detail edges)."""
    pil = Image.fromarray(img_rgb)
    m = remove(pil, session=_SESSION, only_mask=True, post_process_mask=True)
    return np.array(m).astype(np.float32) / 255.0


def refine(img_rgb: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Snap the coarse mask to true edges, drop shadow blobs, clean the rim."""
    guide = img_rgb.astype(np.float32) / 255.0

    # Guided filter pulls the blobby mask onto real image edges at full res.
    refined = cv2.ximgproc.guidedFilter(guide, mask.astype(np.float32),
                                        GF_RADIUS, 1e-4)
    refined = np.clip(refined, 0, 1)

    # Firm curve — with edges now snapped we can threshold tightly, no jaggies.
    a = np.clip((refined - 0.45) / (0.60 - 0.45), 0, 1)

    # Keep only the largest solid region (removes any detached shadow blob).
    core = (a > 0.6).astype(np.uint8)
    num, labels, stats, _ = cv2.connectedComponentsWithStats(core, connectivity=8)
    if num > 1:
        biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        keep = (labels == biggest).astype(np.uint8)
    else:
        keep = core
    keep = cv2.morphologyEx(
        keep, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    )
    band = cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    a = np.maximum(a * band, keep.astype(np.float32))

    # Edge decontamination: erode the matte inward to drop the thin dark rim
    # where a shadowed product edge blends into a dark background.
    if ERODE_PX > 0:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (_odd(ERODE_PX * 2 - 1),) * 2)
        a = a * cv2.erode((a > 0.5).astype(np.uint8), k).astype(np.float32)

    a = cv2.GaussianBlur(a, (0, 0), 0.7)  # sub-pixel feather for a clean edge
    return np.clip(a, 0, 1)


def replace_background(src_path: Path, dst_path: Path) -> None:
    img_rgb = np.array(Image.open(src_path).convert("RGB"))
    a = refine(img_rgb, raw_mask(img_rgb))[:, :, None]
    white = np.full_like(img_rgb, 255, dtype=np.uint8).astype(np.float32)
    comp = (img_rgb.astype(np.float32) * a + white * (1 - a)).astype(np.uint8)
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
