#!/usr/bin/env python3
"""Replace a product photo's background with a plain white studio background.

Segments the product from its background using OpenCV's GrabCut algorithm
(classic computer vision, no external model download required — works fully
offline) and composites the cutout onto a solid white canvas the same size as
the original photo. Run on one image at a time so each result can be checked
before doing the rest of the catalog.

Usage:
    python3 tools/replace_background.py assets/img/products/grips-dailygrind.jpg

Writes the result next to the source as <name>-whitebg.jpg (never overwrites
the original) so it can be reviewed before deciding whether to replace it.
"""
import sys
from pathlib import Path

import cv2
import numpy as np

BACKGROUND_BGR = (255, 255, 255)
MARGIN_RATIO = 0.04  # assume this fraction of the border is background


def segment_foreground(img_bgr: np.ndarray) -> np.ndarray:
    """Returns a 0/1 mask the same size as img_bgr; 1 = keep (product)."""
    h, w = img_bgr.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)

    mx, my = int(w * MARGIN_RATIO), int(h * MARGIN_RATIO)
    rect = (mx, my, w - 2 * mx, h - 2 * my)

    cv2.grabCut(img_bgr, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
    return np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype("uint8")


def feather_mask(mask: np.ndarray, radius: int = 3) -> np.ndarray:
    """Soften the cutout edge so it doesn't look pasted-on."""
    mask_f = mask.astype(np.float32)
    blurred = cv2.GaussianBlur(mask_f, (radius * 2 + 1, radius * 2 + 1), 0)
    return np.clip(blurred, 0, 1)


def replace_background(src_path: Path, dst_path: Path) -> None:
    img_bgr = cv2.imread(str(src_path))
    if img_bgr is None:
        raise ValueError(f"Could not read image: {src_path}")

    mask = segment_foreground(img_bgr)
    alpha = feather_mask(mask)[:, :, None]

    background = np.full_like(img_bgr, BACKGROUND_BGR, dtype=np.uint8)
    composite = (img_bgr.astype(np.float32) * alpha + background.astype(np.float32) * (1 - alpha))
    composite = composite.astype(np.uint8)

    cv2.imwrite(str(dst_path), composite, [cv2.IMWRITE_JPEG_QUALITY, 92])


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    src_path = Path(sys.argv[1])
    if not src_path.is_file():
        print(f"Not found: {src_path}")
        sys.exit(1)

    dst_path = src_path.with_name(src_path.stem + "-whitebg" + src_path.suffix)
    replace_background(src_path, dst_path)
    print(f"Wrote {dst_path}")


if __name__ == "__main__":
    main()
