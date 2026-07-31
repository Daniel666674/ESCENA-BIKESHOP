#!/usr/bin/env python3
"""Batch-convert product photo backgrounds to solid white.

Usage:
  python3 tools/remove-bg.py <file-or-directory> [-o OUTPUT_DIR] [options]

Examples:
  python3 tools/remove-bg.py assets/img/products/mi-producto.jpg
  python3 tools/remove-bg.py assets/img/products -o assets/img/products-white
  python3 tools/remove-bg.py assets/img/products -o out --canvas 1200 --matting

See tools/README.md for the full option list and install instructions.
"""

import argparse
import sys
import traceback
from pathlib import Path

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}


def eprint(*a, **kw):
    print(*a, file=sys.stderr, **kw)


def build_arg_parser():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("input", help="Image file or directory of images")
    p.add_argument("-o", "--output", help="Output directory (default: <input>_white next to the source)")
    p.add_argument("--model", default="isnet-general-use",
                    help="rembg model (default: isnet-general-use — best general edge quality). "
                         "Other options: u2net, u2netp, isnet-anime, silueta")
    p.add_argument("--matting", action="store_true", default=True,
                    help="Use alpha matting for cleaner edges (default: on)")
    p.add_argument("--no-matting", dest="matting", action="store_false",
                    help="Disable alpha matting (faster, slightly rougher edges)")
    p.add_argument("--canvas", type=int, default=1200,
                    help="Final square canvas size in px (default: 1200). 0 = keep original cutout size, no padding/centering")
    p.add_argument("--pad", type=float, default=0.08,
                    help="Padding around the subject as a fraction of canvas size (default: 0.08 = 8%%)")
    p.add_argument("--format", choices=["jpg", "png"], default="jpg",
                    help="Output format (default: jpg — white bg doesn't need transparency)")
    p.add_argument("--quality", type=int, default=92, help="JPEG quality 1-100 (default: 92)")
    p.add_argument("--recursive", action="store_true", help="Recurse into subdirectories")
    p.add_argument("--overwrite", action="store_true",
                    help="Write back into the SAME file/directory as the input instead of a separate output dir. "
                         "Use with care — originals are lost.")
    return p


def find_images(root: Path, recursive: bool):
    if root.is_file():
        return [root]
    pattern = "**/*" if recursive else "*"
    return sorted(f for f in root.glob(pattern) if f.is_file() and f.suffix.lower() in IMG_EXTS)


def composite_on_white(rgba_img):
    """True alpha compositing (out = alpha*fg + (1-alpha)*white), not a naive
    paste — a naive paste leaves a dark fringe at soft/anti-aliased edges
    because semi-transparent edge pixels still carry some of the original
    (often dark) background color mixed into their RGB."""
    from PIL import Image
    import numpy as np

    arr = np.asarray(rgba_img.convert("RGBA"), dtype=np.float32)
    rgb, alpha = arr[..., :3], arr[..., 3:4] / 255.0
    white = np.full_like(rgb, 255.0)
    out = rgb * alpha + white * (1 - alpha)
    return Image.fromarray(out.astype("uint8"), "RGB")


def trim_and_pad(rgba_img, canvas_size, pad_frac):
    """Crop to the subject's bounding box (from alpha), then center it on a
    square white canvas of canvas_size with pad_frac of breathing room —
    matches the site's square product-card crop (see tienda.html cardHTML)."""
    from PIL import Image

    alpha = rgba_img.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:  # fully transparent — nothing detected, bail to original
        return rgba_img
    subject = rgba_img.crop(bbox)

    if canvas_size <= 0:
        return subject

    usable = canvas_size * (1 - 2 * pad_frac)
    scale = min(usable / subject.width, usable / subject.height)
    new_w, new_h = max(1, round(subject.width * scale)), max(1, round(subject.height * scale))
    subject = subject.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (255, 255, 255, 255))
    canvas.paste(subject, ((canvas_size - new_w) // 2, (canvas_size - new_h) // 2), subject)
    return canvas


def process_one(path: Path, out_path: Path, session, args):
    from PIL import Image
    from rembg import remove

    img = Image.open(path).convert("RGB")

    cutout = remove(
        img,
        session=session,
        alpha_matting=args.matting,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_size=8,
        post_process_mask=True,
    )  # returns RGBA

    framed = trim_and_pad(cutout, args.canvas, args.pad)
    flat = composite_on_white(framed)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    if args.format == "png":
        flat.save(out_path.with_suffix(".png"), "PNG", optimize=True)
    else:
        flat.save(out_path.with_suffix(".jpg"), "JPEG", quality=args.quality, optimize=True)


def main():
    args = build_arg_parser().parse_args()
    in_root = Path(args.input).resolve()
    if not in_root.exists():
        eprint(f"Input not found: {in_root}")
        sys.exit(1)

    images = find_images(in_root, args.recursive)
    if not images:
        eprint(f"No images found under {in_root}")
        sys.exit(1)

    if args.overwrite:
        out_root = None
    elif args.output:
        out_root = Path(args.output).resolve()
    else:
        out_root = in_root.parent / (in_root.stem + "_white") if in_root.is_file() else in_root.parent / (in_root.name + "_white")

    try:
        from rembg import new_session
    except ImportError:
        eprint("Missing dependency. Install with: pip install rembg onnxruntime pillow numpy")
        sys.exit(1)

    print(f"Loading model '{args.model}' (first run downloads it, ~100-180MB)...")
    session = new_session(args.model)

    ok, failed = 0, []
    for i, path in enumerate(images, 1):
        if args.overwrite:
            out_path = path
        else:
            rel = path.relative_to(in_root) if in_root.is_dir() else Path(path.name)
            out_path = out_root / rel
        print(f"[{i}/{len(images)}] {path.name} ...", end=" ", flush=True)
        try:
            process_one(path, out_path, session, args)
            print("done")
            ok += 1
        except Exception as e:
            print(f"FAILED ({e})")
            eprint(traceback.format_exc())
            failed.append((path, str(e)))

    print(f"\n{ok}/{len(images)} succeeded.")
    if failed:
        eprint(f"{len(failed)} failed:")
        for p, msg in failed:
            eprint(f"  - {p}: {msg}")
        sys.exit(2)


if __name__ == "__main__":
    main()
